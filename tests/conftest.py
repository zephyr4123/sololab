"""Shared pytest fixtures."""

import os
import sys
from pathlib import Path

import httpx
import pytest

# Make the backend source importable.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend" / "src"))


@pytest.fixture
def mock_llm_gateway():
    """In-memory LLM gateway double for unit tests that don't need real LLM calls."""

    class MockLLMGateway:
        async def generate(self, messages, **kwargs):
            return {
                "content": "Mock response",
                "model": "mock/model",
                "usage": {"prompt_tokens": 10, "completion_tokens": 20, "cost_usd": 0.0},
            }

        async def stream(self, messages, **kwargs):
            yield "Mock "
            yield "streamed "
            yield "response"

        async def embed(self, texts, **kwargs):
            return [[0.1] * 1024 for _ in texts]

    return MockLLMGateway()


@pytest.fixture
def mock_redis():
    """fakeredis-backed async Redis client for unit tests."""
    try:
        import fakeredis.aioredis

        return fakeredis.aioredis.FakeRedis()
    except ImportError:
        pytest.skip("fakeredis not installed")


@pytest.fixture
def real_llm_config():
    """Load LLMConfig from environment.

    Skips the test when API keys are absent so CI runs without network
    credentials don't appear as failures.
    """
    if not os.getenv("IDEASPARK_API_KEY") and not os.getenv("EMBEDDING_API_KEY"):
        pytest.skip(
            "IDEASPARK_API_KEY / EMBEDDING_API_KEY not set — skipping real-LLM test"
        )

    from sololab.config.settings import get_settings
    from sololab.core.llm_gateway import LLMConfig

    settings = get_settings()
    return LLMConfig(
        base_url=settings.ideaspark_base_url,
        api_key=settings.ideaspark_api_key,
        default_model=settings.ideaspark_model,
        embedding_base_url=settings.embedding_base_url,
        embedding_api_key=settings.embedding_api_key,
        embedding_model=settings.embedding_model,
    )


@pytest.fixture
async def async_client():
    """httpx AsyncClient bound to the full FastAPI app with lifespan."""
    from sololab.main import app

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        async with app.router.lifespan_context(app):
            yield client
