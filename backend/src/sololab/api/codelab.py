"""CodeLab 模块专属 API 路由。

提供 OpenCode 会话管理、消息流式传输、权限控制等端点，
作为 SoloLab 前端与 OpenCode Server 之间的桥接代理。
"""

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/modules/codelab")


def _get_bridge(request: Request):
    """从已加载的 CodeLab 模块获取 OpenCodeBridge 实例。"""
    registry = request.app.state.module_registry
    module = registry.get_module("codelab")
    if not module:
        raise HTTPException(status_code=503, detail="CodeLab module not loaded")
    bridge = getattr(module, "_bridge", None)
    if not bridge:
        raise HTTPException(status_code=503, detail="CodeLab bridge not initialized")
    return bridge


# ── 健康检查 ──────────────────────────────────────

@router.get("/health")
async def health(request: Request) -> dict:
    """检查 OpenCode Server 连通性。"""
    bridge = _get_bridge(request)
    ok = await bridge.health_check()
    return {"ok": ok}


# ── Session API ──────────────────────────────────

class CreateSessionRequest(BaseModel):
    directory: Optional[str] = None


@router.post("/session")
async def create_session(body: CreateSessionRequest, request: Request) -> dict:
    """创建编码会话。"""
    bridge = _get_bridge(request)
    return await bridge.create_session(directory=body.directory)


@router.get("/session")
async def list_sessions(request: Request, directory: Optional[str] = None, limit: Optional[int] = None) -> list:
    """列出编码会话。"""
    bridge = _get_bridge(request)
    try:
        return await bridge.list_sessions(directory=directory, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenCode Server error: {e}")


@router.get("/session/{session_id}")
async def get_session(session_id: str, request: Request) -> dict:
    """获取会话详情。"""
    bridge = _get_bridge(request)
    try:
        return await bridge.get_session(session_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenCode Server error: {e}")


@router.delete("/session/{session_id}")
async def delete_session(session_id: str, request: Request) -> dict:
    """删除会话。"""
    bridge = _get_bridge(request)
    try:
        await bridge.delete_session(session_id)
        return {"deleted": True, "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenCode Server error: {e}")


# ── Message API ──────────────────────────────────

class SendMessageRequest(BaseModel):
    content: str


@router.get("/session/{session_id}/messages")
async def get_messages(session_id: str, request: Request) -> list:
    """获取会话消息列表。"""
    bridge = _get_bridge(request)
    try:
        return await bridge.get_messages(session_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenCode Server error: {e}")


@router.post("/session/{session_id}/msg")
async def send_message(session_id: str, body: SendMessageRequest, request: Request):
    """发送消息并流式返回 Agent 响应（SSE）。"""
    bridge = _get_bridge(request)

    async def event_generator():
        try:
            async for event in bridge.send_message(session_id, body.content):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error("CodeLab SSE 流异常: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/session/{session_id}/stream")
async def stream_session(session_id: str, request: Request):
    """SSE 监听会话事件流。"""
    bridge = _get_bridge(request)

    async def event_generator():
        try:
            async for event in bridge._stream_events(session_id):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error("CodeLab 事件流异常: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Abort ────────────────────────────────────────

@router.post("/session/{session_id}/abort")
async def abort_session(session_id: str, request: Request) -> dict:
    """中止当前执行。"""
    bridge = _get_bridge(request)
    try:
        await bridge.abort_session(session_id)
        return {"aborted": True, "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenCode Server error: {e}")


# ── Diff & Files ─────────────────────────────────

@router.get("/session/{session_id}/diff")
async def get_session_diff(session_id: str, request: Request) -> dict:
    """获取会话累计 diff。"""
    bridge = _get_bridge(request)
    try:
        return await bridge.get_session_diff(session_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenCode Server error: {e}")


@router.get("/session/{session_id}/files")
async def list_session_files(session_id: str, request: Request) -> Any:
    """列出会话相关文件。"""
    bridge = _get_bridge(request)
    try:
        return await bridge.list_files()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenCode Server error: {e}")


# ── Permission ───────────────────────────────────

class PermissionReplyRequest(BaseModel):
    permission_id: str
    allowed: bool


@router.post("/permission/{permission_id}")
async def reply_permission(permission_id: str, body: PermissionReplyRequest, request: Request) -> dict:
    """回复权限请求。"""
    bridge = _get_bridge(request)
    try:
        await bridge.reply_permission(permission_id, body.allowed)
        return {"replied": True, "permission_id": permission_id, "allowed": body.allowed}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenCode Server error: {e}")


@router.get("/permission")
async def list_permissions(request: Request) -> list:
    """列出待处理的权限请求。"""
    bridge = _get_bridge(request)
    try:
        return await bridge.list_permissions()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenCode Server error: {e}")
