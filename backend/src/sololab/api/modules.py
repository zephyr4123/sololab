"""Module management + execution API."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from sololab.api._deps import AuthDep, build_module_context
from sololab.core.module_registry import ModuleRequest
from sololab.core.observability import task_context
from sololab.schemas.module import ModuleRunRequest

logger = logging.getLogger(__name__)
router = APIRouter()


class ReportIdea(BaseModel):
    """Top-idea entry sent to the report-generation endpoint."""

    content: str
    author: str = "unknown"
    elo_score: float = 1500
    rank: int = 0


class ReportRequest(BaseModel):
    """Report-generation request — takes already-ranked ideas, no re-run."""

    topic: str
    ideas: List[ReportIdea]
    cost_usd: float = 0.0


class StopRequest(BaseModel):
    """Stop request body — carries the task_id to cancel."""

    task_id: Optional[str] = None


@router.get("/modules")
async def list_modules(request: Request) -> list[dict[str, Any]]:
    registry = request.app.state.module_registry
    return [asdict(m) for m in registry.list_modules()]


@router.post("/modules/{module_id}/load", dependencies=[AuthDep])
async def load_module(module_id: str, request: Request) -> dict:
    registry = request.app.state.module_registry
    if registry.get_module(module_id):
        return {"status": "already_loaded", "module_id": module_id}

    available = registry.discover_modules()
    if module_id not in available:
        raise HTTPException(404, f"Module '{module_id}' not found in available modules")

    try:
        cls = registry.load_module_class(available[module_id]["entry_point"])
        ctx = build_module_context(request.app)
        await registry.load_module(cls(), ctx)
        return {"status": "loaded", "module_id": module_id}
    except Exception as e:
        raise HTTPException(500, f"Failed to load module '{module_id}': {e}")


@router.delete("/modules/{module_id}/unload", dependencies=[AuthDep])
async def unload_module(module_id: str, request: Request) -> dict:
    registry = request.app.state.module_registry
    if not registry.get_module(module_id):
        raise HTTPException(404, f"Module '{module_id}' not loaded")
    await registry.unload_module(module_id)
    return {"status": "unloaded", "module_id": module_id}


@router.get("/modules/{module_id}/config")
async def get_module_config(module_id: str, request: Request) -> dict:
    registry = request.app.state.module_registry
    module = registry.get_module(module_id)
    if not module:
        raise HTTPException(404, f"Module '{module_id}' not found")
    return asdict(module.manifest())


@router.post("/modules/{module_id}/run", dependencies=[AuthDep])
async def run_module(module_id: str, body: ModuleRunRequest, request: Request) -> dict:
    """Synchronous module execution — collect all events, return as list."""
    registry = request.app.state.module_registry
    if not registry.get_module(module_id):
        raise HTTPException(404, f"Module '{module_id}' not loaded")

    ctx = build_module_context(request.app)
    mod_request = ModuleRequest(input=body.input, params=body.params or {})
    results = []
    async for chunk in registry.run(module_id, mod_request, ctx):
        results.append(chunk)
    return {"module_id": module_id, "results": results}


@router.post("/modules/{module_id}/stream", dependencies=[AuthDep])
async def stream_module(
    module_id: str, body: ModuleRunRequest, request: Request
) -> StreamingResponse:
    """SSE module execution with task tracking, session persistence, cancellation."""
    registry = request.app.state.module_registry
    tsm = request.app.state.task_state_manager
    session_mgr = request.app.state.session_manager

    if not registry.get_module(module_id):
        raise HTTPException(404, f"Module '{module_id}' not loaded")

    task_id = await tsm.create_task(module_id, {"input": body.input})
    ctx = build_module_context(request.app)
    ctx.cancel_event = tsm.get_cancel_event(task_id)
    ctx.task_id = task_id
    mod_request = ModuleRequest(
        input=body.input, params=body.params or {}, session_id=body.session_id
    )

    session_id = await _ensure_session(session_mgr, body.session_id, body.input, module_id)
    ctx.session_id = session_id
    ctx.history = await _load_history(session_mgr, session_id)

    async def event_generator():
        # Bind task_id to the ContextVar so downstream LLM calls (via
        # CostTrackingProvider) attribute their cost/trace to this task.
        with task_context(task_id):
            collected_events: list[dict] = []
            yield _sse(
                {"type": "task_created", "task_id": task_id, "session_id": session_id}
            )

            try:
                async for chunk in registry.run(module_id, mod_request, ctx):
                    if tsm.is_cancelled(task_id):
                        yield _sse({"type": "status", "phase": "cancelled"})
                        break
                    event_data = chunk if isinstance(chunk, dict) else {"content": str(chunk)}
                    collected_events.append(event_data)
                    await tsm.append_event(
                        task_id, event_data.get("type", "text"), event_data
                    )
                    yield _sse(event_data)

                if tsm.is_cancelled(task_id):
                    await _persist_assistant_turn(
                        session_mgr, session_id, module_id, task_id,
                        collected_events, status="cancelled",
                    )
                else:
                    await tsm.complete_task(task_id, {})
                    await _persist_assistant_turn(
                        session_mgr, session_id, module_id, task_id,
                        collected_events,
                    )
            except Exception as e:
                logger.exception("stream_module_failed", extra={"task_id": task_id})
                await tsm.fail_task(task_id, str(e))
                await _persist_assistant_turn(
                    session_mgr, session_id, module_id, task_id,
                    collected_events, status="failed", error=str(e),
                )
                yield _sse({"type": "error", "error": str(e)})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/modules/{module_id}/stop", dependencies=[AuthDep])
async def stop_module(module_id: str, body: StopRequest, request: Request) -> dict:
    tsm = request.app.state.task_state_manager
    if not body.task_id:
        return {"status": "no_task_id", "module_id": module_id}
    await tsm.cancel_task(body.task_id)
    return {"status": "cancelled", "module_id": module_id, "task_id": body.task_id}


@router.post("/modules/{module_id}/report", dependencies=[AuthDep])
async def export_report(
    module_id: str, body: ReportRequest, request: Request
) -> dict:
    """Render the user-supplied top ideas into a Markdown research report.

    The module is not re-run; the LLM call here only formats the input ideas.
    """
    registry = request.app.state.module_registry
    if not registry.get_module(module_id):
        raise HTTPException(404, f"Module '{module_id}' not loaded")
    if not body.ideas:
        raise HTTPException(400, "No ideas provided. Run the module first and submit top ideas.")
    if not body.topic.strip():
        raise HTTPException(400, "Topic cannot be empty.")

    llm = request.app.state.llm_gateway
    ideas_text = "\n".join(
        f"### Rank #{idea.rank}: (Elo {round(idea.elo_score)})\n"
        f"**Author:** {idea.author}\n\n"
        f"{idea.content}\n"
        for idea in sorted(body.ideas, key=lambda x: x.rank)
    )
    prompt = (
        f"Generate a comprehensive research ideation report in Markdown format.\n\n"
        f"## Topic\n{body.topic}\n\n"
        f"## Top Ideas\n{ideas_text}\n\n"
        f"Write a well-structured report with:\n"
        f"1. Executive Summary\n"
        f"2. Methodology (multi-agent collaborative ideation)\n"
        f"3. Top Research Ideas (with analysis)\n"
        f"4. Recommended Next Steps\n"
        f"5. References & Further Reading\n\n"
        f"Use proper Markdown formatting with headers, bullet points, and emphasis."
    )

    result = await llm.generate(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=4096,
    )

    return {
        "module_id": module_id,
        "topic": body.topic,
        "report_markdown": result["content"],
        "idea_count": len(body.ideas),
        "cost_usd": body.cost_usd + result["usage"].get("cost_usd", 0),
    }


# ── helpers ───────────────────────────────────────────────────────────────────


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def _ensure_session(
    session_mgr,
    incoming_id: Optional[str],
    input_text: str,
    module_id: str,
) -> Optional[str]:
    """Return a session id, creating one and appending the user message if needed."""
    if not session_mgr:
        return incoming_id

    if incoming_id:
        try:
            await session_mgr.add_message(
                session_id=incoming_id, role="user", content=input_text, module_id=module_id,
            )
        except Exception:
            logger.warning("session_append_failed", extra={"session_id": incoming_id})
        return incoming_id

    try:
        new_id = await session_mgr.create_session(title=input_text[:50], module_id=module_id)
        await session_mgr.add_message(
            session_id=new_id, role="user", content=input_text, module_id=module_id,
        )
        return new_id
    except Exception:
        logger.warning("session_create_failed — running without persistence")
        return None


async def _load_history(session_mgr, session_id: Optional[str]) -> Optional[list]:
    if not session_mgr or not session_id:
        return None
    try:
        return await session_mgr.get_context_messages(session_id)
    except Exception:
        return None


async def _persist_assistant_turn(
    session_mgr,
    session_id: Optional[str],
    module_id: str,
    task_id: str,
    events: list[dict],
    *,
    status: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    if not session_mgr or not session_id:
        return
    metadata: dict[str, Any] = {"events": events, "task_id": task_id}
    if status:
        metadata["status"] = status
    if error:
        metadata["error"] = error
    cost = next(
        (e.get("cost_usd", 0) for e in reversed(events) if e.get("type") == "done"),
        0,
    )
    try:
        await session_mgr.add_message(
            session_id=session_id, role="assistant", content="",
            module_id=module_id, metadata=metadata, cost_usd=cost,
        )
    except Exception:
        logger.warning("assistant_persist_failed", extra={"task_id": task_id})
