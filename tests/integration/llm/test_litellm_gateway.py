"""LLM Gateway 集成测试 —— 使用真实 Qwen API。"""

import pytest

from sololab.core.llm_gateway import LLMGateway


class TestLiteLLMGateway:
    """需要真实 API 密钥和网络的集成测试。"""

    @pytest.mark.integration
    async def test_generate_with_real_model(self, real_llm_config):
        """使用真实 Qwen API 测试 generate。"""
        gw = LLMGateway(real_llm_config)
        result = await gw.generate(
            messages=[{"role": "user", "content": "说你好"}],
            max_tokens=20,
        )
        assert isinstance(result["content"], str)
        assert len(result["content"]) > 0
        assert result["usage"]["prompt_tokens"] > 0
        assert result["usage"]["completion_tokens"] > 0

    @pytest.mark.integration
    async def test_stream_with_real_model(self, real_llm_config):
        """使用真实 Qwen API 测试 stream。"""
        gw = LLMGateway(real_llm_config)
        chunks = []
        async for chunk in gw.stream(
            messages=[{"role": "user", "content": "说一个字：好"}],
        ):
            chunks.append(chunk)
        full = "".join(chunks)
        assert len(full) > 0

    @pytest.mark.integration
    async def test_embed_with_real_model(self, real_llm_config):
        """使用真实 Embedding API 测试 embed。"""
        gw = LLMGateway(real_llm_config)
        vectors = await gw.embed(["集成测试文本"])
        assert len(vectors) == 1
        assert len(vectors[0]) == 1024

    @pytest.mark.integration
    async def test_embed_batch_with_real_model(self, real_llm_config):
        """批量嵌入测试。"""
        gw = LLMGateway(real_llm_config)
        texts = ["文本一", "文本二", "文本三", "文本四", "文本五"]
        vectors = await gw.embed(texts)
        assert len(vectors) == 5
        assert all(len(v) == 1024 for v in vectors)
