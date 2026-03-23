"""LLM Gateway 单元测试 —— 使用真实 Qwen API。"""

import pytest

from sololab.core.llm_gateway import LLMConfig, LLMGateway


@pytest.fixture
def gateway(real_llm_config):
    return LLMGateway(real_llm_config)


class TestLLMGateway:

    @pytest.mark.unit
    async def test_generate_returns_expected_format(self, gateway):
        """generate() 应返回 content, model, usage 字段。"""
        result = await gateway.generate(
            messages=[{"role": "user", "content": "说你好"}],
            max_tokens=20,
        )
        assert "content" in result
        assert isinstance(result["content"], str)
        assert len(result["content"]) > 0
        assert "model" in result
        assert "usage" in result
        assert "prompt_tokens" in result["usage"]
        assert "completion_tokens" in result["usage"]
        assert "cost_usd" in result["usage"]

    @pytest.mark.unit
    async def test_generate_cost_fallback(self, gateway):
        """未知模型的 cost_usd 应容错返回 0.0。"""
        result = await gateway.generate(
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=5,
        )
        assert result["usage"]["cost_usd"] == 0.0

    @pytest.mark.unit
    async def test_stream_yields_chunks(self, gateway):
        """stream() 应产出字符串 chunks。"""
        chunks = []
        async for chunk in gateway.stream(
            messages=[{"role": "user", "content": "说一个字：好"}],
        ):
            chunks.append(chunk)
        assert len(chunks) > 0
        assert all(isinstance(c, str) for c in chunks)

    @pytest.mark.unit
    async def test_embed_returns_correct_dimension(self, gateway):
        """embed() 应返回正确维度的向量。"""
        vectors = await gateway.embed(["测试文本"])
        assert len(vectors) == 1
        assert isinstance(vectors[0], list)
        assert len(vectors[0]) == 1024  # text-embedding-v4 dim
        assert all(isinstance(v, float) for v in vectors[0])

    @pytest.mark.unit
    async def test_embed_batch(self, gateway):
        """embed() 应支持批量嵌入。"""
        texts = ["文本一", "文本二", "文本三"]
        vectors = await gateway.embed(texts)
        assert len(vectors) == 3

    @pytest.mark.unit
    def test_config_default_model(self):
        """LLMConfig 应正确设置默认模型。"""
        config = LLMConfig(default_model="qwen-plus")
        gw = LLMGateway(config)
        assert gw.config.default_model == "qwen-plus"
