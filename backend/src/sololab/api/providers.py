"""Provider and cost API — model metadata, smoke tests, cost reporting, traces."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

from sololab.api._deps import AuthDep
from sololab.config.settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[AuthDep])


@router.get("/providers")
async def list_providers(request: Request) -> dict:
    """List the configured LLM channels (chat + embedding)."""
    llm = request.app.state.llm_gateway
    settings = get_settings()
    return {
        "default_model": llm.config.default_model,
        "models": [{"id": llm.config.default_model, "label": llm.config.default_model}],
        "embedding_model": llm.config.embedding_model,
        "budget_limit_usd": settings.budget_limit_usd,
        "chat_provider": llm.chat_provider_name,
        "embed_provider": llm.embed_provider_name,
    }


@router.post("/providers/{name}/test")
async def test_provider(request: Request, name: str) -> dict:
    """Smoke-test a provider by issuing a one-token hello."""
    llm = request.app.state.llm_gateway
    try:
        result = await llm.generate(
            messages=[{"role": "user", "content": "Say hello in one word."}],
            model=name,
            max_tokens=10,
        )
        return {
            "provider": name,
            "status": "ok",
            "model": result.get("model"),
            "response": result.get("content", "")[:100],
        }
    except Exception as e:
        logger.exception("provider_smoke_test_failed", extra={"provider": name})
        return {"provider": name, "status": "error", "error": str(e)[:200]}


@router.get("/providers/cost")
async def get_cost(request: Request, days: int = 30) -> dict:
    cost_tracker = request.app.state.cost_tracker
    return await cost_tracker.get_total_cost(days=days)


@router.get("/providers/cost/module/{module_id}")
async def get_module_cost(request: Request, module_id: str, days: int = 30) -> dict:
    cost_tracker = request.app.state.cost_tracker
    return await cost_tracker.get_module_cost(module_id, days=days)


@router.get("/providers/cost/task/{task_id}")
async def get_task_cost(request: Request, task_id: str) -> dict:
    cost_tracker = request.app.state.cost_tracker
    return await cost_tracker.get_task_cost(task_id)


@router.get("/providers/traces")
async def get_traces(
    request: Request, task_id: Optional[str] = None, limit: int = 50
) -> dict:
    tracer = request.app.state.llm_tracer
    return {
        "traces": tracer.get_traces(task_id=task_id, limit=limit),
        "summary": tracer.get_summary(task_id=task_id),
    }


@router.get("/providers/runs")
async def get_run_history(
    request: Request, module_id: Optional[str] = None, limit: int = 20
) -> dict:
    message_store = request.app.state.message_store
    try:
        runs = await message_store.get_run_history(module_id=module_id, limit=limit)
    except Exception:
        logger.exception("run_history_query_failed", extra={"module_id": module_id})
        raise HTTPException(500, "Failed to fetch run history")
    return {"runs": runs}


@router.get("/providers/runs/{task_id}/messages")
async def get_run_messages(
    request: Request, task_id: str, msg_type: Optional[str] = None
) -> dict:
    message_store = request.app.state.message_store
    try:
        messages = await message_store.get_messages(task_id, msg_type=msg_type)
    except Exception:
        logger.exception("run_messages_query_failed", extra={"task_id": task_id})
        raise HTTPException(500, "Failed to fetch run messages")
    return {"task_id": task_id, "messages": messages}


@router.get("/providers/runs/{task_id}/export")
async def export_run(request: Request, task_id: str) -> dict:
    message_store = request.app.state.message_store
    try:
        markdown = await message_store.export_run_as_markdown(task_id)
    except Exception as e:
        logger.exception("run_export_failed", extra={"task_id": task_id})
        raise HTTPException(500, f"Export failed: {e}")
    return {"task_id": task_id, "markdown": markdown}
