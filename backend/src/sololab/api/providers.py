"""提供商与费用的 API 路由。"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/providers")
async def list_providers(request: Request) -> dict:
    """列出可用的 LLM 提供商和模型。"""
    llm = request.app.state.llm_gateway
    config = llm.config

    # 构建模型列表：default_model + fallback_chain（去重）
    all_models = [config.default_model]
    for model in config.fallback_chain:
        if model not in all_models:
            all_models.append(model)

    models = [
        {"id": m, "label": m.split("/")[-1] if "/" in m else m}
        for m in all_models
    ]

    return {
        "default_model": config.default_model,
        "models": models,
        "embedding_model": config.embedding_model,
        "budget_limit_usd": config.budget_limit_usd,
    }


@router.post("/providers/{name}/test")
async def test_provider(request: Request, name: str) -> dict:
    """测试提供商连通性。"""
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
        return {"provider": name, "status": "error", "error": str(e)[:200]}


@router.get("/providers/cost")
async def get_cost(request: Request, days: int = 30) -> dict:
    """获取费用统计。"""
    cost_tracker = request.app.state.cost_tracker
    if not cost_tracker:
        raise HTTPException(503, "Cost tracker not initialized")
    return await cost_tracker.get_total_cost(days=days)


@router.get("/providers/cost/module/{module_id}")
async def get_module_cost(request: Request, module_id: str, days: int = 30) -> dict:
    """获取模块费用统计。"""
    cost_tracker = request.app.state.cost_tracker
    if not cost_tracker:
        raise HTTPException(503, "Cost tracker not initialized")
    return await cost_tracker.get_module_cost(module_id, days=days)


@router.get("/providers/cost/task/{task_id}")
async def get_task_cost(request: Request, task_id: str) -> dict:
    """获取任务费用统计。"""
    cost_tracker = request.app.state.cost_tracker
    if not cost_tracker:
        raise HTTPException(503, "Cost tracker not initialized")
    return await cost_tracker.get_task_cost(task_id)


@router.get("/providers/traces")
async def get_traces(request: Request, task_id: Optional[str] = None, limit: int = 50) -> dict:
    """获取 LLM 调用追踪记录。"""
    tracer = getattr(request.app.state, "llm_tracer", None)
    if not tracer:
        return {"traces": [], "summary": {}}
    traces = tracer.get_traces(task_id=task_id, limit=limit)
    summary = tracer.get_summary(task_id=task_id)
    return {"traces": traces, "summary": summary}


@router.get("/providers/runs")
async def get_run_history(request: Request, module_id: Optional[str] = None, limit: int = 20) -> dict:
    """获取运行历史。"""
    message_store = getattr(request.app.state, "message_store", None)
    if not message_store:
        raise HTTPException(503, "Message store not initialized")
    try:
        runs = await message_store.get_run_history(module_id=module_id, limit=limit)
        return {"runs": runs}
    except Exception:
        return {"runs": []}


@router.get("/providers/runs/{task_id}/messages")
async def get_run_messages(request: Request, task_id: str, msg_type: Optional[str] = None) -> dict:
    """获取运行的黑板消息。"""
    message_store = getattr(request.app.state, "message_store", None)
    if not message_store:
        raise HTTPException(503, "Message store not initialized")
    try:
        messages = await message_store.get_messages(task_id, msg_type=msg_type)
        return {"task_id": task_id, "messages": messages}
    except Exception:
        return {"task_id": task_id, "messages": []}


@router.get("/providers/runs/{task_id}/export")
async def export_run(request: Request, task_id: str) -> dict:
    """导出运行结果为 Markdown。"""
    message_store = getattr(request.app.state, "message_store", None)
    if not message_store:
        raise HTTPException(503, "Message store not initialized")
    try:
        markdown = await message_store.export_run_as_markdown(task_id)
        return {"task_id": task_id, "markdown": markdown}
    except Exception as e:
        raise HTTPException(500, f"Export failed: {e}")
