"""SoloLab FastAPI application entry point."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sololab.api import documents, modules, providers, sessions, tasks, tools
from sololab.config.settings import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown."""
    settings = get_settings()

    # TODO: Initialize core services
    # - Redis connection pool
    # - PostgreSQL connection pool
    # - LLM Gateway
    # - Module Registry (load modules from filesystem)
    # - Tool Registry (register built-in tools)
    # - Task State Manager
    # - Document Pipeline

    yield

    # TODO: Cleanup
    # - Close DB connections
    # - Close Redis connections


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="SoloLab API",
        description="AI-assisted research platform for independent researchers",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(modules.router, prefix="/api", tags=["modules"])
    app.include_router(tasks.router, prefix="/api", tags=["tasks"])
    app.include_router(documents.router, prefix="/api", tags=["documents"])
    app.include_router(sessions.router, prefix="/api", tags=["sessions"])
    app.include_router(providers.router, prefix="/api", tags=["providers"])
    app.include_router(tools.router, prefix="/api", tags=["tools"])

    @app.get("/health")
    async def health_check() -> dict:
        return {"status": "ok", "version": "0.1.0"}

    return app


app = create_app()
