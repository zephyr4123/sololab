"""LLM gateway tests — exercise the real LLM channel from settings."""

import pytest

from sololab.core.llm_gateway import LLMConfig, LLMGateway


@pytest.fixture
def gateway(real_llm_config):
    return LLMGateway(real_llm_config)


class TestLLMGateway:

    @pytest.mark.unit
    async def test_generate_returns_expected_format(self, gateway):
        """generate() should return content + model + usage."""
        result = await gateway.generate(
            messages=[{"role": "user", "content": "Say hello"}],
            max_tokens=100,
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
    async def test_generate_cost_tracking(self, gateway):
        """cost_usd should be a non-negative float for known + unknown models."""
        result = await gateway.generate(
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=50,
        )
        assert isinstance(result["usage"]["cost_usd"], float)
        assert result["usage"]["cost_usd"] >= 0.0

    @pytest.mark.unit
    async def test_stream_yields_chunks(self, gateway):
        """stream() should yield string chunks."""
        chunks = []
        async for chunk in gateway.stream(
            messages=[{"role": "user", "content": "Say one character"}],
        ):
            chunks.append(chunk)
        assert len(chunks) > 0
        assert all(isinstance(c, str) for c in chunks)

    @pytest.mark.unit
    async def test_embed_returns_correct_dimension(self, gateway):
        """embed() should return a vector of the expected dimension."""
        vectors = await gateway.embed(["test"])
        assert len(vectors) == 1
        assert isinstance(vectors[0], list)
        assert len(vectors[0]) == 1024  # text-embedding-v4 dim
        assert all(isinstance(v, float) for v in vectors[0])

    @pytest.mark.unit
    async def test_embed_batch(self, gateway):
        """embed() should accept a batch."""
        texts = ["text one", "text two", "text three"]
        vectors = await gateway.embed(texts)
        assert len(vectors) == 3

    @pytest.mark.unit
    def test_config_rejects_missing_api_key(self):
        """LLMConfig must fail loudly when API keys are absent."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError) as exc_info:
            LLMConfig(default_model="qwen-plus")
        assert "api_key" in str(exc_info.value).lower()

    @pytest.mark.unit
    def test_config_rejects_placeholder_api_key(self):
        """LLMConfig must reject the obvious placeholder so misconfig surfaces at startup."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError) as exc_info:
            LLMConfig(api_key="sk-xxx", embedding_api_key="sk-xxx")
        assert "placeholder" in str(exc_info.value).lower()

    @pytest.mark.unit
    def test_config_accepts_real_keys(self):
        """A well-formed config should construct cleanly without an LLMGateway."""
        config = LLMConfig(
            api_key="sk-real-1234",
            embedding_api_key="sk-real-5678",
            default_model="qwen-plus",
        )
        assert config.default_model == "qwen-plus"
        assert config.api_key == "sk-real-1234"
