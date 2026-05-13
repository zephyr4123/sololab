"""SoloLab FastAPI application entrypoint.

Composition root layered in single-responsibility init helpers; each helper
returns the services it owns so failures are localised and easy to reason
about. The lifespan handler simply sequences them.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sololab.api import (
    codelab,
    codelab_browse,
    documents,
    modules,
    providers,
    sessions,
    tasks,
    writer,
)
from sololab.api._deps import build_module_context
from sololab.config.settings import Settings, get_settings
from sololab.core.auth import APIKeyAuth
from sololab.core.cost_tracker import CostTracker
from sololab.core.llm_gateway import LLMConfig, LLMGateway
from sololab.core.memory_manager import MemoryManager
from sololab.core.message_store import MessageStore
from sololab.core.module_registry import ModuleContext, ModuleRegistry
from sololab.core.observability import (
    BudgetAlert,
    LLMCallTracer,
    RequestContextMiddleware,
    get_logger,
    setup_logging,
)
from sololab.core.rate_limiter import RateLimitConfig, RateLimitMiddleware
from sololab.core.session_manager import SessionManager
from sololab.core.task_state_manager import TaskStateManager
from sololab.core.tool_registry import ToolRegistry
from sololab.db import create_db_engine, create_session_factory

logger = get_logger("main")


# ── Lifespan helpers ──────────────────────────────────────────────────────────


async def _init_redis(app: FastAPI, settings: Settings) -> None:
    app.state.redis = aioredis.from_url(settings.redis_url, decode_responses=False)


async def _init_database(app: FastAPI, settings: Settings) -> None:
    engine = create_db_engine(settings.database_url)
    app.state.db_engine = engine
    app.state.db_session = create_session_factory(engine)
    logger.info("database_ready")


def _init_observability(app: FastAPI, settings: Settings) -> None:
    setup_logging(log_level=settings.log_level, json_output=settings.log_json)
    app.state.llm_tracer = LLMCallTracer()
    app.state.budget_alert = BudgetAlert(budget_usd=settings.budget_limit_usd)


def _init_llm_layer(app: FastAPI, settings: Settings) -> None:
    """Build the LLM gateway and the persistence-backed cost tracker.

    The cost tracker has to be constructed before the gateway because the
    gateway's `CostTrackingProvider` wrappers receive it as a dependency.
    """
    app.state.cost_tracker = CostTracker(
        app.state.db_session, default_budget=settings.budget_limit_usd
    )

    chat_url, chat_key, chat_model = settings.llm_chat_credentials()
    embed_url, embed_key, embed_model = settings.llm_embed_credentials()
    llm_config = LLMConfig(
        base_url=chat_url,
        api_key=chat_key,
        default_model=chat_model,
        embedding_base_url=embed_url,
        embedding_api_key=embed_key,
        embedding_model=embed_model,
    )
    app.state.llm_gateway = LLMGateway(
        llm_config,
        cost_tracker=app.state.cost_tracker,
        tracer=app.state.llm_tracer,
        budget_alert=app.state.budget_alert,
    )


def _init_persistence_services(app: FastAPI, settings: Settings) -> None:
    app.state.task_state_manager = TaskStateManager(app.state.redis)
    app.state.memory_manager = MemoryManager(app.state.llm_gateway, app.state.db_session)
    app.state.session_manager = SessionManager(app.state.db_session)
    app.state.message_store = MessageStore(app.state.db_session)

    # Document pipeline owns the DocParseTool injection — instantiate here so
    # the tool registry can wire to it.
    from sololab.core.document_pipeline import DocumentPipeline

    app.state.document_pipeline = DocumentPipeline(
        app.state.llm_gateway, app.state.db_session, settings.storage_path
    )


def _init_tools(app: FastAPI) -> None:
    """Register built-in external API tools."""
    from sololab.tools.arxiv_search import ArxivTool
    from sololab.tools.doc_parse import DocParseTool
    from sololab.tools.scholar_search import SemanticScholarTool
    from sololab.tools.tavily_search import TavilySearchTool

    tool_registry = ToolRegistry()
    doc_parse_tool = DocParseTool()
    doc_parse_tool.set_pipeline(app.state.document_pipeline)

    for tool in [TavilySearchTool(), ArxivTool(), SemanticScholarTool(), doc_parse_tool]:
        tool_registry.register(tool)

    app.state.tool_registry = tool_registry


def _init_auth(app: FastAPI, settings: Settings) -> None:
    api_keys = [k.strip() for k in (settings.api_keys or "").split(",") if k.strip()]
    app.state.api_key_auth = APIKeyAuth(api_keys=api_keys, enabled=bool(api_keys))


async def _register_modules(app: FastAPI) -> None:
    registry = ModuleRegistry()
    app.state.module_registry = registry
    module_ctx = build_module_context(app)

    for module_id, info in registry.discover_modules().items():
        try:
            cls = registry.load_module_class(info["entry_point"])
            await registry.load_module(cls(), module_ctx)
            logger.info("module_loaded", module_id=module_id)
        except Exception:
            logger.exception("module_load_failed", module_id=module_id)


async def _shutdown(app: FastAPI) -> None:
    if hasattr(app.state, "redis") and app.state.redis is not None:
        await app.state.redis.aclose()
    if hasattr(app.state, "db_engine") and app.state.db_engine is not None:
        await app.state.db_engine.dispose()
        logger.info("database_closed")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    _init_observability(app, settings)
    await _init_redis(app, settings)
    await _init_database(app, settings)
    _init_llm_layer(app, settings)
    _init_persistence_services(app, settings)
    _init_tools(app)
    _init_auth(app, settings)
    await _register_modules(app)
    yield
    await _shutdown(app)


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="SoloLab API",
        description="AI-assisted research platform for independent researchers",
        version="0.4.0",
        lifespan=lifespan,
    )

    # CORS — never combine `*` origins with credentials (browsers reject it).
    cors_origins = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=cors_origins != ["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    # Order matters: request context first (so RateLimit logs carry request_id),
    # then rate limiting.
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(RateLimitMiddleware, config=RateLimitConfig(enabled=True))

    storage_dir = settings.storage_path
    os.makedirs(storage_dir, exist_ok=True)
    app.mount("/storage", StaticFiles(directory=storage_dir), name="storage")

    app.include_router(modules.router, prefix="/api", tags=["modules"])
    app.include_router(tasks.router, prefix="/api", tags=["tasks"])
    app.include_router(documents.router, prefix="/api", tags=["documents"])
    app.include_router(sessions.router, prefix="/api", tags=["sessions"])
    app.include_router(providers.router, prefix="/api", tags=["providers"])
    app.include_router(codelab.router, prefix="/api", tags=["codelab"])
    app.include_router(codelab_browse.router, prefix="/api", tags=["codelab"])
    app.include_router(writer.router, prefix="/api", tags=["writer"])

    @app.get("/health")
    async def health_check(request: Request) -> dict:
        """Deep health check — pings every backing service."""
        services: dict[str, bool] = {}

        # Redis
        try:
            await request.app.state.redis.ping()
            services["redis"] = True
        except Exception:
            services["redis"] = False

        # Postgres
        try:
            async with request.app.state.db_session() as session:
                await session.execute(_HEALTH_QUERY)
            services["database"] = True
        except Exception:
            services["database"] = False

        services["llm_gateway"] = (
            getattr(request.app.state, "llm_gateway", None) is not None
        )

        all_healthy = all(services.values())
        return {
            "status": "ok" if all_healthy else "degraded",
            "version": app.version,
            "services": services,
            "modules_loaded": len(request.app.state.module_registry.list_modules()),
        }

    return app


# Sentinel SQL used by /health — kept module-level to avoid re-parsing per request.
from sqlalchemy import text as _sa_text  # noqa: E402

_HEALTH_QUERY = _sa_text("SELECT 1")


app = create_app()
