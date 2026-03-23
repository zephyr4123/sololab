"""消息持久化单元测试（逻辑测试，不需要真实数据库）。"""

import pytest


class TestMessageStore:
    """MessageStore 基本逻辑测试。"""

    @pytest.mark.unit
    def test_message_store_init(self):
        """MessageStore 应可正常初始化。"""
        from sololab.core.message_store import MessageStore

        store = MessageStore(db=None)
        assert store.db is None

    @pytest.mark.unit
    async def test_export_empty_run(self):
        """空运行应返回默认 Markdown。"""
        from sololab.core.message_store import MessageStore
        from unittest.mock import AsyncMock, MagicMock

        mock_db = MagicMock()
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_db.return_value = mock_session

        store = MessageStore(db=mock_db)
        md = await store.export_run_as_markdown("nonexistent")
        assert "No messages found" in md
