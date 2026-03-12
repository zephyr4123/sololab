"""Shared pytest fixtures."""

import sys
from pathlib import Path

import pytest

# Add backend src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend" / "src"))


@pytest.fixture
def mock_llm_gateway():
    """Mock LLM Gateway that returns predetermined responses."""

    class MockLLMGateway:
        async def generate(self, messages, **kwargs):
            return {
                "content": "Mock response",
                "model": "mock/model",
                "usage": {"prompt_tokens": 10, "completion_tokens": 20, "cost_usd": 0.001},
            }

        async def stream(self, messages, **kwargs):
            yield "Mock "
            yield "streamed "
            yield "response"

        async def embed(self, texts, **kwargs):
            return [[0.1] * 1536 for _ in texts]

    return MockLLMGateway()


@pytest.fixture
def mock_redis():
    """Mock Redis client for testing."""
    try:
        import fakeredis.aioredis

        return fakeredis.aioredis.FakeRedis()
    except ImportError:
        pytest.skip("fakeredis not installed")
