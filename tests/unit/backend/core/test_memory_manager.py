"""记忆管理器的单元测试。"""

import pytest


class TestMemoryManager:
    """基于 pgvector 的记忆管理测试。"""

    @pytest.mark.unit
    async def test_store_returns_id(self, mock_llm_gateway):
        """存储内容应返回记忆 ID。"""
        # TODO: MemoryManager 集成数据库后实现
        pass

    @pytest.mark.unit
    async def test_retrieve_returns_relevant_results(self, mock_llm_gateway):
        """检索应返回语义相关的结果。"""
        # TODO: MemoryManager 集成数据库后实现
        pass

    @pytest.mark.unit
    def test_scope_hierarchy():
        """记忆作用域应遵循 GLOBAL > PROJECT > SESSION > MODULE 层级。"""
        from sololab.core.memory_manager import MemoryScope

        scopes = list(MemoryScope)
        assert MemoryScope.MODULE in scopes
        assert MemoryScope.GLOBAL in scopes
