"""SoloLab FastAPI 应用入口。"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sololab.api import documents, modules, providers, sessions, tasks, tools
from sololab.config.settings import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """应用生命周期：启动与关闭。"""
    settings = get_settings()

    # TODO: 初始化核心服务
    # - Redis 连接池
    # - PostgreSQL 连接池
    # - LLM 网关
    # - 模块注册表（从文件系统加载模块）
    # - 工具注册表（注册内置工具）
    # - 任务状态管理器
    # - 文档处理管道

    yield

    # TODO: 清理资源
    # - 关闭数据库连接
    # - 关闭 Redis 连接


def create_app() -> FastAPI:
    """创建并配置 FastAPI 应用。"""
    settings = get_settings()

    app = FastAPI(
        title="SoloLab API",
        description="AI-assisted research platform for independent researchers",
        version="0.1.0",
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
        return {"status": "ok", "version": "0.1.0"}

    return app


app = create_app()
