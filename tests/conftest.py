"""共享的 pytest 测试夹具。"""

import sys
from pathlib import Path

import pytest
import httpx

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
    """用于测试的模拟 Redis 客户端。"""
    try:
        import fakeredis.aioredis

        return fakeredis.aioredis.FakeRedis()
    except ImportError:
        pytest.skip("fakeredis not installed")


@pytest.fixture
def real_llm_config():
    """从 settings 加载真实 LLM 配置。"""
    from sololab.config.settings import get_settings

    settings = get_settings()
    from sololab.core.llm_gateway import LLMConfig

    return LLMConfig(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        default_model=settings.llm_model,
        embedding_base_url=settings.embedding_base_url,
        embedding_api_key=settings.embedding_api_key,
        embedding_model=settings.embedding_model,
        cache_enabled=False,
    )


@pytest.fixture
async def async_client():
    """httpx AsyncClient 用于 API 测试（含 lifespan 初始化）。"""
    from sololab.main import app

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        # 手动触发 lifespan startup
        from contextlib import asynccontextmanager
        async with app.router.lifespan_context(app):
            yield client
