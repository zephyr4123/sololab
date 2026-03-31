"""SoloLab FastAPI 应用入口。"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from sololab.api import codelab, documents, modules, providers, sessions, tasks, tools
from sololab.config.settings import get_settings
from sololab.core.llm_gateway import LLMConfig, LLMGateway
from sololab.core.module_registry import ModuleContext, ModuleRegistry
from sololab.core.prompt_manager import PromptManager
from sololab.core.task_state_manager import TaskStateManager
from sololab.core.tool_registry import ToolRegistry

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """应用生命周期：启动时初始化核心服务，关闭时释放资源。"""
    settings = get_settings()

    # Redis 连接池
    redis = aioredis.from_url(settings.redis_url, decode_responses=False)
    app.state.redis = redis

    # LLM 网关
    llm_config = LLMConfig(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        default_model=settings.llm_model,
        embedding_base_url=settings.embedding_base_url,
        embedding_api_key=settings.embedding_api_key,
        embedding_model=settings.embedding_model,
        cache_enabled=False,
    )
    app.state.llm_gateway = LLMGateway(llm_config)

    # 任务状态管理器
    app.state.task_state_manager = TaskStateManager(redis)

    # 工具注册表 + 注册内置工具
    tool_registry = ToolRegistry()
    app.state.tool_registry = tool_registry

    from sololab.tools.tavily_search import TavilySearchTool
    from sololab.tools.arxiv_search import ArxivTool
    from sololab.tools.scholar_search import SemanticScholarTool
    from sololab.tools.doc_parse import DocParseTool

    doc_parse_tool = DocParseTool()
    for tool in [TavilySearchTool(), ArxivTool(), SemanticScholarTool(), doc_parse_tool]:
        tool_registry.register(tool)

    # 提示词管理器
    app.state.prompt_manager = PromptManager()

    # --- Phase 3: 数据库 + 新服务 ---
    db_session = None
    try:
        from sololab.models.orm import create_db_engine, create_session_factory

        engine = create_db_engine(settings.database_url)
        db_session = create_session_factory(engine)
        app.state.db_engine = engine
        app.state.db_session = db_session
        logger.info("数据库连接池已初始化")
    except Exception as e:
        logger.warning("数据库初始化失败（Phase 3 服务不可用）: %s", e)
        app.state.db_engine = None
        app.state.db_session = None

    # 记忆管理器
    if db_session:
        from sololab.core.memory_manager import MemoryManager
        app.state.memory_manager = MemoryManager(app.state.llm_gateway, db_session)
    else:
        app.state.memory_manager = None

    # 会话管理器
    if db_session:
        from sololab.core.session_manager import SessionManager
        app.state.session_manager = SessionManager(db_session)
    else:
        app.state.session_manager = None

    # 文档处理管道
    if db_session:
        from sololab.core.document_pipeline import DocumentPipeline
        app.state.document_pipeline = DocumentPipeline(
            app.state.llm_gateway, db_session, settings.storage_path
        )
        # 将 DocumentPipeline 注入到 DocParseTool
        doc_parse_tool.set_pipeline(app.state.document_pipeline)
    else:
        app.state.document_pipeline = None

    # 费用追踪器
    if db_session:
        from sololab.core.cost_tracker import CostTracker
        app.state.cost_tracker = CostTracker(
            db_session, default_budget=settings.budget_limit_usd
        )
    else:
        app.state.cost_tracker = None

    # 消息存储
    if db_session:
        from sololab.core.message_store import MessageStore
        app.state.message_store = MessageStore(db_session)
    else:
        app.state.message_store = None

    # 可观测性
    from sololab.core.observability import LLMCallTracer, MessageTracer, BudgetAlert, setup_logging
    setup_logging(log_level="INFO", json_output=False)
    app.state.llm_tracer = LLMCallTracer()
    app.state.message_tracer = MessageTracer()
    app.state.budget_alert = BudgetAlert(budget_usd=settings.budget_limit_usd)

    # API Key 认证
    from sololab.core.auth import APIKeyAuth
    api_keys = [k.strip() for k in (getattr(settings, 'api_keys', '') or '').split(',') if k.strip()]
    app.state.api_key_auth = APIKeyAuth(api_keys=api_keys, enabled=bool(api_keys))

    # 限速中间件（在 lifespan 之外配置，此处仅设置 config）
    from sololab.core.rate_limiter import RateLimitConfig
    app.state.rate_limit_config = RateLimitConfig(
        requests_per_minute=60,
        requests_per_hour=1000,
        enabled=True,
    )

    # 模块注册表 + 自动发现并加载内置模块
    registry = ModuleRegistry()
    app.state.module_registry = registry
    module_ctx = _build_module_context(app)
    available = registry.discover_modules()
    for module_id, info in available.items():
        try:
            cls = registry.load_module_class(info["entry_point"])
            await registry.load_module(cls(), module_ctx)
            logger.info("已加载模块: %s", module_id)
        except Exception as e:
            logger.warning("加载模块 %s 失败: %s", module_id, e)

    yield

    # 关闭资源
    await redis.aclose()
    if hasattr(app.state, "db_engine") and app.state.db_engine:
        await app.state.db_engine.dispose()
        logger.info("数据库连接已关闭")


def _build_module_context(app: FastAPI) -> ModuleContext:
    """从 app.state 构建模块运行时上下文。"""
    return ModuleContext(
        llm_gateway=app.state.llm_gateway,
        tool_registry=app.state.tool_registry,
        memory_manager=app.state.memory_manager,
        task_state_manager=app.state.task_state_manager,
        document_pipeline=getattr(app.state, "document_pipeline", None),
    )


def get_module_context(request: Request) -> ModuleContext:
    """FastAPI 依赖：从请求中获取模块上下文。"""
    return _build_module_context(request.app)


def create_app() -> FastAPI:
    """创建并配置 FastAPI 应用。"""
    settings = get_settings()

    app = FastAPI(
        title="SoloLab API",
        description="AI-assisted research platform for independent researchers",
        version="0.3.0",
        lifespan=lifespan,
    )

    # 跨域配置（Docker 部署由 Caddy 反代，后端信任所有来源）
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 限速中间件
    from sololab.core.rate_limiter import RateLimitMiddleware, RateLimitConfig
    app.add_middleware(RateLimitMiddleware, config=RateLimitConfig(enabled=True))

    # 注册路由
    app.include_router(modules.router, prefix="/api", tags=["modules"])
    app.include_router(tasks.router, prefix="/api", tags=["tasks"])
    app.include_router(documents.router, prefix="/api", tags=["documents"])
    app.include_router(sessions.router, prefix="/api", tags=["sessions"])
    app.include_router(providers.router, prefix="/api", tags=["providers"])
    app.include_router(tools.router, prefix="/api", tags=["tools"])
    app.include_router(codelab.router, prefix="/api", tags=["codelab"])

    @app.get("/health")
    async def health_check(request: Request) -> dict:
        """增强的健康检查端点。"""
        health = {
            "status": "ok",
            "version": "0.3.0",
            "services": {
                "redis": hasattr(request.app.state, "redis") and request.app.state.redis is not None,
                "database": hasattr(request.app.state, "db_session") and request.app.state.db_session is not None,
                "llm_gateway": hasattr(request.app.state, "llm_gateway") and request.app.state.llm_gateway is not None,
            },
        }
        # 模块统计
        if hasattr(request.app.state, "module_registry"):
            health["modules_loaded"] = len(request.app.state.module_registry.list_modules())
        return health

    return app


app = create_app()
