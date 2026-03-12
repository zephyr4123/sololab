"""Integration tests for memory store with pgvector."""

import pytest


class TestMemoryStore:
    """Tests requiring PostgreSQL with pgvector extension."""

    @pytest.mark.integration
    async def test_store_and_retrieve_by_similarity(self):
        """Store content, then retrieve by semantic similarity."""
        # TODO: Requires PostgreSQL with pgvector
        # 1. Store several memory chunks with embeddings
        # 2. Query with a similar text
        # 3. Verify top results are semantically relevant
        pass

    @pytest.mark.integration
    async def test_scope_isolation(self):
        """Memories in different scopes should not interfere."""
        # TODO: Requires PostgreSQL
        # 1. Store in MODULE scope
        # 2. Store in PROJECT scope
        # 3. Retrieve with MODULE scope should only get MODULE memories
        pass
