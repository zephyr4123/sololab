"""API routes for module management and execution."""

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from sololab.models.module import ModuleRunRequest

router = APIRouter()


@router.get("/modules")
async def list_modules() -> list[dict[str, Any]]:
    """List all loaded modules."""
    # TODO: Inject ModuleRegistry dependency
    return []


@router.post("/modules/{module_id}/load")
async def load_module(module_id: str) -> dict:
    """Load a module by ID."""
    # TODO: Load module from filesystem via ModuleRegistry
    return {"status": "loaded", "module_id": module_id}


@router.delete("/modules/{module_id}/unload")
async def unload_module(module_id: str) -> dict:
    """Unload a module."""
    # TODO: Unload via ModuleRegistry
    return {"status": "unloaded", "module_id": module_id}


@router.get("/modules/{module_id}/config")
async def get_module_config(module_id: str) -> dict:
    """Get module configuration."""
    # TODO: Return module config from registry
    raise HTTPException(404, f"Module '{module_id}' not found")


@router.post("/modules/{module_id}/run")
async def run_module(module_id: str, request: ModuleRunRequest) -> dict:
    """Synchronous module execution."""
    # TODO: Execute module and collect all results
    raise HTTPException(501, "Not implemented")


@router.post("/modules/{module_id}/stream")
async def stream_module(module_id: str, request: ModuleRunRequest) -> StreamingResponse:
    """SSE streaming module execution with task state tracking."""

    # TODO: Create task, execute module, stream events
    async def event_generator():
        # Placeholder - will yield SSE events
        yield f"data: {json.dumps({'type': 'status', 'status': 'starting'})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/modules/{module_id}/stop")
async def stop_module(module_id: str) -> dict:
    """Stop a running module execution."""
    # TODO: Cancel task via TaskStateManager
    return {"status": "stopped", "module_id": module_id}
