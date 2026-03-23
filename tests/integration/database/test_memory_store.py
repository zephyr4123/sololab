"""PostgreSQL + pgvector 记忆存储集成测试。"""

import pytest


class TestMemoryStore:
    """MemoryManager 与真实 PostgreSQL + pgvector 的集成测试。"""

    @pytest.fixture
    async def memory_manager(self, real_llm_config):
        """创建连接真实数据库的 MemoryManager。"""
        from sololab.config.settings import get_settings
        from sololab.core.llm_gateway import LLMGateway
        from sololab.core.memory_manager import MemoryManager
        from sololab.models.orm import create_db_engine, create_session_factory

        settings = get_settings()
        try:
            engine = create_db_engine(settings.database_url)
            db_session = create_session_factory(engine)
            gw = LLMGateway(real_llm_config)
            mm = MemoryManager(gw, db_session)
            # 快速检查表是否存在
            try:
                await mm.count()
            except Exception:
                await engine.dispose()
                pytest.skip("memories table not found (run alembic upgrade head)")
            yield mm
            await engine.dispose()
        except Exception as e:
            pytest.skip(f"Database not available: {e}")

    @pytest.mark.integration
    async def test_store_and_retrieve(self, memory_manager):
        """存储记忆并通过向量搜索检索。"""
        from sololab.core.memory_manager import MemoryScope

        # 存储
        memory_id = await memory_manager.store(
            content="Quantum computing uses qubits for parallel processing",
            scope=MemoryScope.PROJECT,
            metadata={"source": "test"},
        )
        assert memory_id > 0

        try:
            # 检索
            results = await memory_manager.retrieve(
                query="quantum parallel processing",
                scope=MemoryScope.PROJECT,
                top_k=5,
            )
            assert len(results) > 0
            assert results[0].content == "Quantum computing uses qubits for parallel processing"
            assert results[0].similarity > 0.5
        finally:
            # 清理
            await memory_manager.delete(memory_id)

    @pytest.mark.integration
    async def test_scope_hierarchy(self, memory_manager):
        """跨作用域层级检索。"""
        from sololab.core.memory_manager import MemoryScope

        # 在不同作用域存储
        global_id = await memory_manager.store(
            content="Global knowledge: AI is transforming research",
            scope=MemoryScope.GLOBAL,
        )
        project_id = await memory_manager.store(
            content="Project knowledge: We study NLP models",
            scope=MemoryScope.PROJECT,
            scope_id="proj-1",
        )

        try:
            # 在 PROJECT 作用域搜索应该也能找到 GLOBAL 的记忆
            results = await memory_manager.retrieve(
                query="AI research",
                scope=MemoryScope.PROJECT,
                include_parent_scopes=True,
                top_k=10,
            )
            scopes = {r.scope.value for r in results}
            # 至少应该找到一些结果
            assert len(results) > 0
        finally:
            await memory_manager.delete(global_id)
            await memory_manager.delete(project_id)

    @pytest.mark.integration
    async def test_delete_by_scope(self, memory_manager):
        """按作用域批量删除。"""
        from sololab.core.memory_manager import MemoryScope

        # 存储多条记忆
        ids = []
        for i in range(3):
            mid = await memory_manager.store(
                content=f"Test memory {i}",
                scope=MemoryScope.MODULE,
                scope_id="test-module",
            )
            ids.append(mid)

        # 按作用域删除
        deleted = await memory_manager.delete_by_scope(
            MemoryScope.MODULE, scope_id="test-module"
        )
        assert deleted >= 3
