"""会话管理的 API 路由。"""

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/sessions")
async def list_sessions() -> list:
    """列出用户会话。"""
    # TODO: 从数据库查询会话
    return []


@router.post("/sessions")
async def create_session() -> dict:
    """创建新会话。"""
    # TODO: 通过 SessionManager 创建会话
    return {"session_id": "placeholder", "status": "created"}


@router.get("/sessions/{session_id}/history")
async def get_session_history(session_id: str) -> dict:
    """获取会话消息历史。"""
    # TODO: 从数据库查询历史
    raise HTTPException(404, f"Session '{session_id}' not found")


@router.post("/memory/search")
async def search_memory(query: str, scope: str = "project", top_k: int = 5) -> dict:
    """跨作用域搜索记忆。"""
    # TODO: 通过 MemoryManager 进行向量搜索
    return {"query": query, "scope": scope, "results": []}
