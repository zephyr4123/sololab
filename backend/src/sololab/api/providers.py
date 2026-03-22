"""LLM 提供商管理的 API 路由。"""

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.get("/providers")
async def list_providers(request: Request) -> list:
    """列出当前配置的 LLM 提供商信息。"""
    gw = request.app.state.llm_gateway
    config = gw.config
    return [
        {
            "name": "llm",
            "base_url": config.base_url,
            "model": config.default_model,
            "status": "configured",
        },
        {
            "name": "embedding",
            "base_url": config.embedding_base_url,
            "model": config.embedding_model,
            "status": "configured",
        },
    ]


@router.post("/providers/{provider_name}/test")
async def test_provider(provider_name: str, request: Request) -> dict:
    """测试提供商连通性。"""
    gw = request.app.state.llm_gateway
    try:
        if provider_name == "embedding":
            vectors = await gw.embed(["connectivity test"])
            return {"provider": provider_name, "status": "ok", "dim": len(vectors[0])}
        else:
            result = await gw.generate(
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=5,
            )
            return {"provider": provider_name, "status": "ok", "model": result["model"]}
    except Exception as e:
        raise HTTPException(502, f"Provider test failed: {e}")


@router.get("/providers/cost")
async def get_cost_stats() -> dict:
    """获取 API 费用统计。"""
    # TODO: 从 LiteLLM 查询费用数据
    return {"total_cost_usd": 0.0, "breakdown": {}}
