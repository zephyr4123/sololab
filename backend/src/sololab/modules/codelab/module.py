"""CodeLab 模块 - AI 编码助手（基于 OpenCode 引擎）。"""

import logging
from typing import Any, AsyncGenerator

from sololab.config.settings import get_settings
from sololab.core.module_registry import (
    ModuleBase,
    ModuleContext,
    ModuleManifest,
    ModuleRequest,
)
from sololab.modules.codelab.bridge import OpenCodeBridge

logger = logging.getLogger(__name__)


class CodeLabModule(ModuleBase):
    """CodeLab：基于 OpenCode 引擎的 AI 编码助手。

    通过 HTTP 桥接层调用 OpenCode Server 的 API，
    将 AI 编码能力集成到 SoloLab 平台。
    """

    def __init__(self) -> None:
        self._bridge: OpenCodeBridge | None = None

    def manifest(self) -> ModuleManifest:
        return ModuleManifest(
            id="codelab",
            name="CodeLab",
            version="0.1.0",
            description="AI-powered coding assistant based on OpenCode engine",
            icon="Code",
            entry_point="sololab.modules.codelab.module:CodeLabModule",
            required_tools=[],
            required_models=["reasoning"],
            config_schema={
                "type": "object",
                "properties": {
                    "opencode_url": {
                        "type": "string",
                        "default": "http://localhost:3100",
                        "description": "OpenCode server URL",
                    },
                    "default_model": {
                        "type": "string",
                        "default": "anthropic/claude-sonnet-4-20250514",
                        "description": "Default LLM model for coding tasks",
                    },
                    "timeout_seconds": {
                        "type": "integer",
                        "default": 300,
                        "description": "Request timeout in seconds",
                    },
                },
            },
        )

    async def on_load(self, ctx: ModuleContext) -> None:
        """初始化 OpenCode 桥接层。"""
        settings = get_settings()
        opencode_url = getattr(settings, "opencode_url", None) or "http://localhost:3100"
        opencode_password = getattr(settings, "opencode_server_password", None) or ""
        opencode_username = getattr(settings, "opencode_server_username", None) or "opencode"

        # default_directory: OpenCode 需要 workspace context，默认使用项目根目录
        import os
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )))
        self._bridge = OpenCodeBridge(
            base_url=opencode_url,
            username=opencode_username,
            password=opencode_password if opencode_password else None,
            timeout=300,
            default_directory=project_root,
        )
        logger.info("CodeLab 模块已加载，OpenCode Server: %s", opencode_url)

    async def on_unload(self) -> None:
        """清理资源。"""
        if self._bridge:
            await self._bridge.close()
            self._bridge = None
        logger.info("CodeLab 模块已卸载")

    async def execute(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[Any, None]:
        """处理编码请求：创建/复用会话，发送消息，流式返回结果。

        params 支持的参数：
        - session_id: 复用已有会话（可选）
        - directory: 项目目录路径（可选）
        - action: 操作类型（chat/abort/diff/files），默认 chat
        - permission_id + allowed: 回复权限请求
        """
        if not self._bridge:
            raise RuntimeError("Module not loaded")

        action = request.params.get("action", "chat")

        if action == "health":
            yield await self._handle_health()
            return

        if action == "sessions":
            yield await self._handle_list_sessions(request)
            return

        if action == "abort":
            yield await self._handle_abort(request)
            return

        if action == "diff":
            yield await self._handle_diff(request)
            return

        if action == "permission":
            yield await self._handle_permission(request)
            return

        # 默认: chat
        async for event in self._handle_chat(request, ctx):
            yield event

    async def _handle_health(self) -> dict:
        """健康检查。"""
        ok = await self._bridge.health_check()
        return {"type": "health", "ok": ok}

    async def _handle_list_sessions(self, request: ModuleRequest) -> dict:
        """列出会话。"""
        directory = request.params.get("directory")
        sessions = await self._bridge.list_sessions(directory=directory)
        return {"type": "sessions", "sessions": sessions}

    async def _handle_abort(self, request: ModuleRequest) -> dict:
        """中止会话。"""
        session_id = request.params.get("session_id")
        if not session_id:
            return {"type": "error", "error": "session_id is required for abort"}
        await self._bridge.abort_session(session_id)
        return {"type": "aborted", "session_id": session_id}

    async def _handle_diff(self, request: ModuleRequest) -> dict:
        """获取会话 diff。"""
        session_id = request.params.get("session_id")
        if not session_id:
            return {"type": "error", "error": "session_id is required for diff"}
        diff = await self._bridge.get_session_diff(session_id)
        return {"type": "diff", "session_id": session_id, "diff": diff}

    async def _handle_permission(self, request: ModuleRequest) -> dict:
        """回复权限请求。"""
        permission_id = request.params.get("permission_id")
        allowed = request.params.get("allowed", False)
        if not permission_id:
            return {"type": "error", "error": "permission_id is required"}
        await self._bridge.reply_permission(permission_id, allowed)
        return {"type": "permission_replied", "permission_id": permission_id, "allowed": allowed}

    async def _handle_chat(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[dict, None]:
        """处理编码对话：创建/复用会话 → 发送消息 → 流式返回。"""
        session_id = request.params.get("session_id")
        directory = request.params.get("directory")

        # 如果没有 session_id，创建新会话
        if not session_id:
            session_data = await self._bridge.create_session(directory=directory)
            session_id = session_data.get("id") or session_data.get("sessionID")
            yield {
                "type": "session_created",
                "session_id": session_id,
                "session": session_data,
            }

        yield {"type": "status", "phase": "sending", "session_id": session_id}

        # 流式接收 Agent 响应
        async for event in self._bridge.send_message(session_id, request.input):
            # 检查取消信号
            if ctx.cancel_event and ctx.cancel_event.is_set():
                await self._bridge.abort_session(session_id)
                yield {"type": "cancelled", "session_id": session_id}
                return

            yield event

        yield {"type": "done", "session_id": session_id}
