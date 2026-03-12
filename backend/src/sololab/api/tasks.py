"""API routes for task state management (disconnect recovery)."""

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/tasks/{task_id}/state")
async def get_task_state(task_id: str) -> dict:
    """Get task state snapshot."""
    # TODO: Inject TaskStateManager dependency
    raise HTTPException(404, f"Task '{task_id}' not found")


@router.get("/tasks/{task_id}/events")
async def get_task_events(task_id: str, after: int = 0) -> dict:
    """Get events after a given event_id (for disconnect recovery)."""
    # TODO: Fetch events from TaskStateManager
    return {"task_id": task_id, "events": []}


@router.post("/tasks/{task_id}/resume")
async def resume_task(task_id: str):
    """Re-establish SSE connection for a running task."""
    # TODO: Resume SSE streaming from current event_id
    raise HTTPException(501, "Not implemented")


@router.delete("/tasks/{task_id}")
async def cancel_task(task_id: str) -> dict:
    """Cancel a running task."""
    # TODO: Cancel via TaskStateManager
    return {"status": "cancelled", "task_id": task_id}
