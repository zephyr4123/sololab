"""提供商与费用的 API 路由。"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/providers")
async def list_providers(request: Request) -> dict:
    """列出可用的 LLM 提供商。"""
    llm = request.app.state.llm_gateway
    config = llm.config
    return {
        "default_model": config.default_model,
        "fallback_chain": config.fallback_chain,
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
