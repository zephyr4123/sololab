"""记忆管理器的单元测试。"""

import pytest


class TestMemoryManager:
    """基于 pgvector 的记忆管理测试。"""

    @pytest.mark.unit
    async def test_store_returns_id(self, mock_llm_gateway):
        """存储内容应返回记忆 ID（当前为 stub）。"""
        # MemoryManager 的 pgvector 集成是 Phase 3 的任务
        pass

    @pytest.mark.unit
    async def test_retrieve_returns_relevant_results(self, mock_llm_gateway):
        """检索应返回语义相关的结果（当前为 stub）。"""
        pass

    @pytest.mark.unit
    def test_scope_hierarchy(self):
        """记忆作用域应包含 MODULE 和 GLOBAL。"""
        from sololab.core.memory_manager import MemoryScope

        scopes = list(MemoryScope)
        assert MemoryScope.MODULE in scopes
        assert MemoryScope.GLOBAL in scopes
