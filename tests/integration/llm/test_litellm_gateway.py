"""Integration tests for LiteLLM Gateway."""

import pytest


class TestLiteLLMGateway:
    """Tests requiring a running LiteLLM proxy or direct API access."""

    @pytest.mark.integration
    async def test_generate_with_real_model(self):
        """Test actual LLM API call via LiteLLM."""
        # TODO: Requires API key configured
        # 1. Create LLMGateway with real config
        # 2. Call generate() with a simple prompt
        # 3. Verify response format
        pass

    @pytest.mark.integration
    async def test_fallback_chain(self):
        """Test fallback when primary model fails."""
        # TODO: Configure an invalid primary and valid fallback
        # 1. Set primary to a non-existent model
        # 2. Set fallback to a working model
        # 3. Verify generation succeeds via fallback
        pass
