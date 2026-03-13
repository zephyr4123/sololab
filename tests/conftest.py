"""共享的 pytest 测试夹具。"""

import sys
from pathlib import Path

import pytest

# 将后端 src 添加到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "backend" / "src"))


@pytest.fixture
def mock_llm_gateway():
    """返回预设响应的模拟 LLM 网关。"""

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
    """用于测试的模拟 Redis 客户端。"""
    try:
        import fakeredis.aioredis

        return fakeredis.aioredis.FakeRedis()
    except ImportError:
        pytest.skip("fakeredis not installed")
