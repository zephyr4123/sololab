"""SoloLab FastAPI 应用入口。"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from sololab.api import documents, modules, providers, sessions, tasks, tools
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

    for tool_cls in [TavilySearchTool, ArxivTool, SemanticScholarTool, DocParseTool]:
        tool_registry.register(tool_cls())

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
        version="0.2.0",
        lifespan=lifespan,
    )

    # 跨域配置
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 注册路由
    app.include_router(modules.router, prefix="/api", tags=["modules"])
    app.include_router(tasks.router, prefix="/api", tags=["tasks"])
    app.include_router(documents.router, prefix="/api", tags=["documents"])
    app.include_router(sessions.router, prefix="/api", tags=["sessions"])
    app.include_router(providers.router, prefix="/api", tags=["providers"])
    app.include_router(tools.router, prefix="/api", tags=["tools"])

    @app.get("/health")
    async def health_check() -> dict:
        return {"status": "ok", "version": "0.2.0"}

    return app


app = create_app()
