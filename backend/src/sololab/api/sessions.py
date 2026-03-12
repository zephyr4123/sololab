"""API routes for session management."""

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/sessions")
async def list_sessions() -> list:
    """List user sessions."""
    # TODO: Query sessions from DB
    return []


@router.post("/sessions")
async def create_session() -> dict:
    """Create a new session."""
    # TODO: Create session via SessionManager
    return {"session_id": "placeholder", "status": "created"}


@router.get("/sessions/{session_id}/history")
async def get_session_history(session_id: str) -> dict:
    """Get session message history."""
    # TODO: Query history from DB
    raise HTTPException(404, f"Session '{session_id}' not found")


@router.post("/memory/search")
async def search_memory(query: str, scope: str = "project", top_k: int = 5) -> dict:
    """Search memory across scopes."""
    # TODO: Vector search via MemoryManager
    return {"query": query, "scope": scope, "results": []}
