"""会话 API 路由单元测试。"""

import pytest
from unittest.mock import AsyncMock, MagicMock


class TestSessionsAPI:
    """Session API 路由测试。"""

    @pytest.fixture
    async def client_with_session_mgr(self):
        """带模拟 SessionManager 的测试客户端。"""
        import httpx
        from sololab.main import app

        mock_session_mgr = MagicMock()
        mock_session_mgr.create_session = AsyncMock(return_value="test-session-id")
        mock_session_mgr.get_session = AsyncMock(return_value={
            "session_id": "test-session-id",
            "title": "Test Session",
            "module_id": "ideaspark",
            "status": "active",
            "created_at": "2026-03-23T00:00:00",
            "updated_at": "2026-03-23T00:00:00",
        })
        mock_session_mgr.list_sessions = AsyncMock(return_value=[
            {"session_id": "s1", "title": "Session 1", "status": "active"},
            {"session_id": "s2", "title": "Session 2", "status": "active"},
        ])
        mock_session_mgr.add_message = AsyncMock(return_value=1)
        mock_session_mgr.get_history = AsyncMock(return_value=[
            {"id": 1, "role": "user", "content": "hello", "created_at": "2026-03-23T00:00:00"},
            {"id": 2, "role": "assistant", "content": "hi", "created_at": "2026-03-23T00:01:00"},
        ])
        mock_session_mgr.delete_session = AsyncMock(return_value=True)

        mock_memory_mgr = MagicMock()
        mock_memory_mgr.retrieve = AsyncMock(return_value=[])

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            async with app.router.lifespan_context(app):
                app.state.session_manager = mock_session_mgr
                app.state.memory_manager = mock_memory_mgr
                yield client

    @pytest.mark.unit
    async def test_list_sessions(self, client_with_session_mgr):
        """GET /sessions 应返回会话列表。"""
        response = await client_with_session_mgr.get("/api/sessions")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    @pytest.mark.unit
    async def test_create_session(self, client_with_session_mgr):
        """POST /sessions 应创建会话。"""
        response = await client_with_session_mgr.post(
            "/api/sessions",
            json={"title": "New Session", "module_id": "ideaspark"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "test-session-id"
        assert data["status"] == "created"

    @pytest.mark.unit
    async def test_get_session(self, client_with_session_mgr):
        """GET /sessions/{id} 应返回会话详情。"""
        response = await client_with_session_mgr.get("/api/sessions/test-session-id")
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Test Session"

    @pytest.mark.unit
    async def test_get_session_history(self, client_with_session_mgr):
        """GET /sessions/{id}/history 应返回消息历史。"""
        response = await client_with_session_mgr.get("/api/sessions/test-session-id/history")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert data["messages"][0]["role"] == "user"

    @pytest.mark.unit
    async def test_add_message(self, client_with_session_mgr):
        """POST /sessions/{id}/messages 应添加消息。"""
        response = await client_with_session_mgr.post(
            "/api/sessions/test-session-id/messages",
            json={"role": "user", "content": "test message"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message_id"] == 1

    @pytest.mark.unit
    async def test_delete_session(self, client_with_session_mgr):
        """DELETE /sessions/{id} 应删除会话。"""
        response = await client_with_session_mgr.delete("/api/sessions/test-session-id")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"

    @pytest.mark.unit
    async def test_get_nonexistent_session(self, client_with_session_mgr):
        """不存在的会话应返回 404。"""
        client_with_session_mgr._transport.app.state.session_manager.get_session = AsyncMock(return_value=None)
        response = await client_with_session_mgr.get("/api/sessions/nonexistent")
        assert response.status_code == 404

    @pytest.mark.unit
    async def test_memory_search(self, client_with_session_mgr):
        """POST /memory/search 应返回搜索结果。"""
        response = await client_with_session_mgr.post(
            "/api/memory/search?query=test&scope=project&top_k=5"
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data

    @pytest.mark.unit
    async def test_memory_search_invalid_scope(self, client_with_session_mgr):
        """无效作用域应返回 400。"""
        response = await client_with_session_mgr.post(
            "/api/memory/search?query=test&scope=invalid"
        )
        assert response.status_code == 400
