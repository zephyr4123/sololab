"""LLM 提供商管理的 API 路由。"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/providers")
async def list_providers() -> list:
    """列出可用的 LLM 提供商（来自 LiteLLM）。"""
    # TODO: 从 LiteLLM 查询可用模型
    return []


@router.post("/providers/{provider_name}/test")
async def test_provider(provider_name: str) -> dict:
    """测试提供商连通性。"""
    # TODO: 通过 LLMGateway 发送测试请求
    return {"provider": provider_name, "status": "unknown"}


@router.get("/providers/cost")
async def get_cost_stats() -> dict:
    """获取 API 费用统计。"""
    # TODO: 从 LiteLLM 查询费用数据
    return {"total_cost_usd": 0.0, "breakdown": {}}
