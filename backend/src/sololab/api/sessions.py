"""会话管理的 API 路由。"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateSessionRequest(BaseModel):
    """创建会话请求。"""
    title: Optional[str] = None
    module_id: Optional[str] = None
    metadata: dict = {}


class AddMessageRequest(BaseModel):
    """添加消息请求。"""
    role: str
    content: str
    module_id: Optional[str] = None
    metadata: dict = {}
    tokens_used: int = 0
    cost_usd: float = 0.0


@router.get("/sessions")
async def list_sessions(
    request: Request,
    limit: int = 20,
    module_id: Optional[str] = None,
    status: str = "active",
) -> list:
    """列出用户会话。"""
    session_mgr = request.app.state.session_manager
    if not session_mgr:
        raise HTTPException(503, "Session manager not initialized")

    return await session_mgr.list_sessions(limit=limit, module_id=module_id, status=status)


@router.post("/sessions")
async def create_session(request: Request, body: CreateSessionRequest) -> dict:
    """创建新会话。"""
    session_mgr = request.app.state.session_manager
    if not session_mgr:
        raise HTTPException(503, "Session manager not initialized")

    session_id = await session_mgr.create_session(
        title=body.title, module_id=body.module_id, metadata=body.metadata
    )
    return {"session_id": session_id, "status": "created"}


@router.get("/sessions/{session_id}")
async def get_session(request: Request, session_id: str) -> dict:
    """获取会话详情。"""
    session_mgr = request.app.state.session_manager
    if not session_mgr:
        raise HTTPException(503, "Session manager not initialized")

    session = await session_mgr.get_session(session_id)
    if not session:
        raise HTTPException(404, f"Session '{session_id}' not found")
    return session


@router.get("/sessions/{session_id}/history")
async def get_session_history(
    request: Request, session_id: str, limit: int = 100, offset: int = 0
) -> dict:
    """获取会话消息历史。"""
    session_mgr = request.app.state.session_manager
    if not session_mgr:
        raise HTTPException(503, "Session manager not initialized")

    # 先检查会话是否存在
    session = await session_mgr.get_session(session_id)
    if not session:
        raise HTTPException(404, f"Session '{session_id}' not found")

    history = await session_mgr.get_history(session_id, limit=limit, offset=offset)
    return {"session_id": session_id, "messages": history, "total": len(history)}


@router.post("/sessions/{session_id}/messages")
async def add_message(request: Request, session_id: str, body: AddMessageRequest) -> dict:
    """添加消息到会话。"""
    session_mgr = request.app.state.session_manager
    if not session_mgr:
        raise HTTPException(503, "Session manager not initialized")

    # 先检查会话是否存在
    session = await session_mgr.get_session(session_id)
    if not session:
        raise HTTPException(404, f"Session '{session_id}' not found")

    msg_id = await session_mgr.add_message(
        session_id=session_id,
        role=body.role,
        content=body.content,
        module_id=body.module_id,
        metadata=body.metadata,
        tokens_used=body.tokens_used,
        cost_usd=body.cost_usd,
    )
    return {"message_id": msg_id, "status": "created"}


@router.delete("/sessions/{session_id}")
async def delete_session(request: Request, session_id: str) -> dict:
    """删除会话。"""
    session_mgr = request.app.state.session_manager
    if not session_mgr:
        raise HTTPException(503, "Session manager not initialized")

    deleted = await session_mgr.delete_session(session_id)
    if not deleted:
        raise HTTPException(404, f"Session '{session_id}' not found")
    return {"session_id": session_id, "status": "deleted"}


@router.post("/memory/search")
async def search_memory(
    request: Request, query: str, scope: str = "project", top_k: int = 5
) -> dict:
    """跨作用域搜索记忆。"""
    memory_mgr = request.app.state.memory_manager
    if not memory_mgr:
        raise HTTPException(503, "Memory manager not initialized")

    from sololab.core.memory_manager import MemoryScope

    try:
        memory_scope = MemoryScope(scope)
    except ValueError:
        raise HTTPException(400, f"Invalid scope: '{scope}'. Valid: module, session, project, global")

    chunks = await memory_mgr.retrieve(query, scope=memory_scope, top_k=top_k)
    return {
        "query": query,
        "scope": scope,
        "results": [
            {
                "id": c.id,
                "content": c.content,
                "scope": c.scope.value,
                "similarity": round(c.similarity, 4),
                "metadata": c.metadata,
                "timestamp": c.timestamp.isoformat() if c.timestamp else None,
            }
            for c in chunks
        ],
    }
