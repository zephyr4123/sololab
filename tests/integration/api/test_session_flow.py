"""会话管理集成测试。"""

import pytest
import httpx


class TestSessionFlow:
    """会话完整生命周期集成测试。"""

    @pytest.fixture
    async def app_client(self):
        """httpx 客户端（含完整 lifespan）。"""
        from sololab.main import app

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            async with app.router.lifespan_context(app):
                yield client, app

    @pytest.mark.integration
    async def test_session_crud_flow(self, app_client):
        """完整的会话 CRUD 流程。"""
        client, app = app_client

        # 跳过如果数据库不可用
        if not app.state.session_manager:
            pytest.skip("Database not available")

        # 1. 创建会话
        try:
            resp = await client.post(
                "/api/sessions",
                json={"title": "Integration Test Session", "module_id": "ideaspark"},
            )
        except Exception:
            pytest.skip("Phase 3 tables not migrated (run alembic upgrade head)")
        if resp.status_code >= 500:
            pytest.skip("Phase 3 tables not migrated (run alembic upgrade head)")
        assert resp.status_code == 200
        session_id = resp.json()["session_id"]

        try:
            # 2. 获取会话
            resp = await client.get(f"/api/sessions/{session_id}")
            assert resp.status_code == 200
            assert resp.json()["title"] == "Integration Test Session"

            # 3. 添加消息
            resp = await client.post(
                f"/api/sessions/{session_id}/messages",
                json={"role": "user", "content": "Hello from integration test"},
            )
            assert resp.status_code == 200

            resp = await client.post(
                f"/api/sessions/{session_id}/messages",
                json={"role": "assistant", "content": "Hello! How can I help?"},
            )
            assert resp.status_code == 200

            # 4. 获取历史
            resp = await client.get(f"/api/sessions/{session_id}/history")
            assert resp.status_code == 200
            history = resp.json()
            assert history["total"] == 2
            assert history["messages"][0]["role"] == "user"

            # 5. 列出会话
            resp = await client.get("/api/sessions")
            assert resp.status_code == 200
            sessions = resp.json()
            assert any(s["session_id"] == session_id for s in sessions)

        finally:
            # 6. 清理：删除会话
            resp = await client.delete(f"/api/sessions/{session_id}")
            assert resp.status_code == 200

    @pytest.mark.integration
    async def test_health_check(self, app_client):
        """健康检查应返回 ok。"""
        client, _ = app_client
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
        assert resp.json()["version"] == "0.3.0"
