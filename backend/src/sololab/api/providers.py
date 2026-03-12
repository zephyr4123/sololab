"""API routes for LLM provider management."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/providers")
async def list_providers() -> list:
    """List available LLM providers (from LiteLLM)."""
    # TODO: Query LiteLLM for available models
    return []


@router.post("/providers/{provider_name}/test")
async def test_provider(provider_name: str) -> dict:
    """Test provider connectivity."""
    # TODO: Send test request via LLMGateway
    return {"provider": provider_name, "status": "unknown"}


@router.get("/providers/cost")
async def get_cost_stats() -> dict:
    """Get API cost statistics."""
    # TODO: Query cost data from LiteLLM
    return {"total_cost_usd": 0.0, "breakdown": {}}
