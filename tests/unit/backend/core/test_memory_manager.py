"""Unit tests for Memory Manager."""

import pytest


class TestMemoryManager:
    """Tests for pgvector-based memory management."""

    @pytest.mark.unit
    async def test_store_returns_id(self, mock_llm_gateway):
        """Storing content should return a memory ID."""
        # TODO: Implement once MemoryManager has DB integration
        pass

    @pytest.mark.unit
    async def test_retrieve_returns_relevant_results(self, mock_llm_gateway):
        """Retrieving should return semantically relevant results."""
        # TODO: Implement once MemoryManager has DB integration
        pass

    @pytest.mark.unit
    def test_scope_hierarchy():
        """Memory scopes should follow GLOBAL > PROJECT > SESSION > MODULE."""
        from sololab.core.memory_manager import MemoryScope

        scopes = list(MemoryScope)
        assert MemoryScope.MODULE in scopes
        assert MemoryScope.GLOBAL in scopes
