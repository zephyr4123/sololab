"""Unit tests for LLM Gateway."""

import pytest


class TestLLMGateway:
    """Tests for the LiteLLM-based LLM Gateway."""

    @pytest.mark.unit
    async def test_generate_returns_expected_format(self, mock_llm_gateway):
        """generate() should return content, model, and usage."""
        result = await mock_llm_gateway.generate(
            messages=[{"role": "user", "content": "Hello"}]
        )
        assert "content" in result
        assert "model" in result
        assert "usage" in result
        assert "cost_usd" in result["usage"]

    @pytest.mark.unit
    async def test_stream_yields_chunks(self, mock_llm_gateway):
        """stream() should yield string chunks."""
        chunks = []
        async for chunk in mock_llm_gateway.stream(
            messages=[{"role": "user", "content": "Hello"}]
        ):
            chunks.append(chunk)
        assert len(chunks) > 0
        assert all(isinstance(c, str) for c in chunks)

    @pytest.mark.unit
    async def test_embed_returns_vectors(self, mock_llm_gateway):
        """embed() should return list of float vectors."""
        vectors = await mock_llm_gateway.embed(["test text"])
        assert len(vectors) == 1
        assert isinstance(vectors[0], list)
        assert all(isinstance(v, float) for v in vectors[0])
