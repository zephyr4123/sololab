"""CodeLab API 路由单元测试。"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestCodeLabAPI:
    """CodeLab 模块自动加载测试。"""

    @pytest.mark.unit
    async def test_codelab_module_loaded(self, async_client):
        """CodeLab 模块应自动加载。"""
        response = await async_client.get("/api/modules")
        modules = response.json()
        ids = [m["id"] for m in modules]
        assert "codelab" in ids

    @pytest.mark.unit
    async def test_codelab_module_config(self, async_client):
        """CodeLab 模块配置应可获取。"""
        response = await async_client.get("/api/modules/codelab/config")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "codelab"
        assert data["name"] == "CodeLab"


class TestCodeLabAPIWithMockBridge:
    """使用 Mock Bridge 的 CodeLab API 测试。"""

    @pytest.fixture
    async def client_with_mock_bridge(self):
        """注入 mock bridge 的 httpx client。"""
        import httpx
        from sololab.main import app

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            async with app.router.lifespan_context(app):
                # 获取 CodeLab 模块并注入 mock bridge
                registry = app.state.module_registry
                module = registry.get_module("codelab")
                if module:
                    original_bridge = module._bridge
                    mock_bridge = AsyncMock()
                    module._bridge = mock_bridge
                    yield client, mock_bridge
                    module._bridge = original_bridge
                else:
                    pytest.skip("CodeLab module not loaded")

    @pytest.mark.unit
    async def test_health_ok(self, client_with_mock_bridge):
        client, mock_bridge = client_with_mock_bridge
        mock_bridge.health_check = AsyncMock(return_value=True)

        response = await client.get("/api/modules/codelab/health")
        assert response.status_code == 200
        assert response.json()["ok"] is True

    @pytest.mark.unit
    async def test_create_session(self, client_with_mock_bridge):
        client, mock_bridge = client_with_mock_bridge
        mock_bridge.create_session = AsyncMock(return_value={
            "id": "session-abc",
            "title": "",
            "createdAt": "2026-03-29T00:00:00Z",
        })

        response = await client.post(
            "/api/modules/codelab/session",
            json={"directory": "/tmp/project"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "session-abc"
        mock_bridge.create_session.assert_called_once_with(directory="/tmp/project")

    @pytest.mark.unit
    async def test_list_sessions(self, client_with_mock_bridge):
        client, mock_bridge = client_with_mock_bridge
        mock_bridge.list_sessions = AsyncMock(return_value=[
            {"id": "s1", "title": "Session 1"},
            {"id": "s2", "title": "Session 2"},
        ])

        response = await client.get("/api/modules/codelab/session")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    @pytest.mark.unit
    async def test_get_session(self, client_with_mock_bridge):
        client, mock_bridge = client_with_mock_bridge
        mock_bridge.get_session = AsyncMock(return_value={
            "id": "s1",
            "title": "Test Session",
        })

        response = await client.get("/api/modules/codelab/session/s1")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "s1"

    @pytest.mark.unit
    async def test_delete_session(self, client_with_mock_bridge):
        client, mock_bridge = client_with_mock_bridge
        mock_bridge.delete_session = AsyncMock(return_value=True)

        response = await client.delete("/api/modules/codelab/session/s1")
        assert response.status_code == 200
        data = response.json()
        assert data["deleted"] is True

    @pytest.mark.unit
    async def test_abort_session(self, client_with_mock_bridge):
        client, mock_bridge = client_with_mock_bridge
        mock_bridge.abort_session = AsyncMock(return_value=True)

        response = await client.post("/api/modules/codelab/session/s1/abort")
        assert response.status_code == 200
        data = response.json()
        assert data["aborted"] is True

    @pytest.mark.unit
    async def test_get_diff(self, client_with_mock_bridge):
        client, mock_bridge = client_with_mock_bridge
        mock_bridge.get_session_diff = AsyncMock(return_value={
            "diff": "--- a/file.py\n+++ b/file.py\n@@ -1 +1 @@\n-old\n+new",
        })

        response = await client.get("/api/modules/codelab/session/s1/diff")
        assert response.status_code == 200
        data = response.json()
        assert "diff" in data

    @pytest.mark.unit
    async def test_get_messages(self, client_with_mock_bridge):
        client, mock_bridge = client_with_mock_bridge
        mock_bridge.get_messages = AsyncMock(return_value=[
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ])

        response = await client.get("/api/modules/codelab/session/s1/messages")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    @pytest.mark.unit
    async def test_reply_permission(self, client_with_mock_bridge):
        client, mock_bridge = client_with_mock_bridge
        mock_bridge.reply_permission = AsyncMock(return_value=True)

        response = await client.post(
            "/api/modules/codelab/permission/perm-1",
            json={"permission_id": "perm-1", "allowed": True},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["replied"] is True
        assert data["allowed"] is True

    @pytest.mark.unit
    async def test_list_permissions(self, client_with_mock_bridge):
        client, mock_bridge = client_with_mock_bridge
        mock_bridge.list_permissions = AsyncMock(return_value=[])

        response = await client.get("/api/modules/codelab/permission")
        assert response.status_code == 200
        assert response.json() == []
