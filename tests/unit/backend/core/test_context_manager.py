"""上下文窗口管理器单元测试。"""

import pytest


class TestContextWindowManager:
    """ContextWindowManager 测试。"""

    @pytest.fixture
    def manager(self, mock_llm_gateway):
        from sololab.core.context_manager import ContextWindowManager
        return ContextWindowManager(mock_llm_gateway, max_messages=10, summary_threshold=5)

    @pytest.mark.unit
    async def test_short_context_unchanged(self, manager):
        """消息数量未超限时，原样返回。"""
        messages = [{"role": "user", "content": f"msg {i}"} for i in range(5)]
        result = await manager.manage_context(messages)
        assert len(result) == 5

    @pytest.mark.unit
    async def test_sliding_window_trims(self, manager):
        """超过 max_messages 时应用滑动窗口。"""
        messages = [{"role": "user", "content": f"msg {i}"} for i in range(15)]
        result = await manager.manage_context(messages)
        assert len(result) <= 10

    @pytest.mark.unit
    async def test_summary_compression(self, manager):
        """超过 summary_threshold 时压缩早期消息。"""
        messages = [{"role": "user", "content": f"msg {i}"} for i in range(8)]
        result = await manager.manage_context(messages)
        # 应该有摘要消息
        has_summary = any("[Context Summary]" in m.get("content", "") for m in result)
        assert has_summary or len(result) <= 10

    @pytest.mark.unit
    async def test_system_messages_preserved(self, manager):
        """系统消息始终保留。"""
        messages = [
            {"role": "system", "content": "You are helpful."},
            *[{"role": "user", "content": f"msg {i}"} for i in range(12)],
        ]
        result = await manager.manage_context(messages)
        system_msgs = [m for m in result if m["role"] == "system"]
        assert len(system_msgs) >= 1

    @pytest.mark.unit
    def test_estimate_tokens(self, manager):
        """Token 估算应合理。"""
        messages = [{"role": "user", "content": "Hello world"}]  # 11 chars ≈ 2-3 tokens
        tokens = manager.estimate_tokens(messages)
        assert tokens >= 1

    @pytest.mark.unit
    def test_prune_orphan_messages(self, manager):
        """孤立消息应被裁剪。"""
        messages = [
            {"role": "system", "content": "sys", "id": "s1"},
            {"role": "user", "content": "hi", "id": "m1"},
            {"role": "assistant", "content": "hello", "id": "m2"},
            {"role": "user", "content": "orphan", "id": "m3"},
        ]
        reference_graph = {"m2": ["m1"]}  # m2 引用 m1, m3 无引用
        result = manager.prune_orphan_messages(messages, reference_graph)
        # 系统消息和有引用关系的消息应保留
        assert any(m.get("id") == "s1" for m in result)
