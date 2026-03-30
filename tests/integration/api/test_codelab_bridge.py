"""CodeLab 桥接层集成测试。

测试 SoloLab 后端 → OpenCode Server 的端到端连通。
需要 OpenCode Server 运行在 localhost:3100。
"""

import json
import os

import pytest
import httpx


# 跳过条件：OpenCode Server 不可用
def _opencode_available() -> bool:
    """检查 OpenCode Server 是否真正可用（验证 API 响应而非仅端口连通）。"""
    import urllib.request
    port = int(os.environ.get("OPENCODE_PORT", 3100))
    try:
        req = urllib.request.Request(f"http://localhost:{port}/doc")
        with urllib.request.urlopen(req, timeout=3) as resp:
            content_type = resp.headers.get("Content-Type", "")
            return "json" in content_type or "openapi" in resp.read(200).decode("utf-8", errors="ignore").lower()
    except Exception:
        return False


skip_no_opencode = pytest.mark.skipif(
    not _opencode_available(),
    reason="OpenCode Server not running on localhost:3100",
)


@skip_no_opencode
class TestCodeLabBridgeIntegration:
    """SoloLab 后端 → OpenCode Server 完整链路测试。"""

    @pytest.fixture
    async def app_client(self):
        """带 lifespan 的 httpx client。"""
        from sololab.main import app

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            async with app.router.lifespan_context(app):
                yield client

    @pytest.mark.integration
    async def test_codelab_health_ok(self, app_client):
        """当 OpenCode Server 运行时，健康检查应返回 ok=true。"""
        resp = await app_client.get("/api/modules/codelab/health")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    @pytest.mark.integration
    async def test_codelab_list_sessions(self, app_client):
        """列出会话应返回一个列表。"""
        resp = await app_client.get("/api/modules/codelab/session")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.integration
    async def test_codelab_create_and_get_session(self, app_client):
        """创建会话后应可以获取。"""
        # 创建
        resp = await app_client.post(
            "/api/modules/codelab/session",
            json={},
        )
        assert resp.status_code == 200
        session = resp.json()
        session_id = session.get("id") or session.get("sessionID")
        assert session_id

        # 获取
        resp = await app_client.get(f"/api/modules/codelab/session/{session_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert (data.get("id") or data.get("sessionID")) == session_id

    @pytest.mark.integration
    async def test_codelab_create_and_delete_session(self, app_client):
        """创建后删除会话应成功。"""
        # 创建
        resp = await app_client.post(
            "/api/modules/codelab/session",
            json={},
        )
        session = resp.json()
        session_id = session.get("id") or session.get("sessionID")

        # 删除
        resp = await app_client.delete(f"/api/modules/codelab/session/{session_id}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

    @pytest.mark.integration
    async def test_codelab_list_permissions(self, app_client):
        """列出权限请求应返回列表。"""
        resp = await app_client.get("/api/modules/codelab/permission")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.integration
    async def test_codelab_session_messages_empty(self, app_client):
        """新会话的消息列表应为空或返回基础消息。"""
        # 创建
        resp = await app_client.post(
            "/api/modules/codelab/session",
            json={},
        )
        session = resp.json()
        session_id = session.get("id") or session.get("sessionID")

        # 获取消息
        resp = await app_client.get(f"/api/modules/codelab/session/{session_id}/messages")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.integration
    async def test_codelab_module_stream_endpoint(self, app_client):
        """通用模块 stream 端点应可触发 CodeLab。"""
        resp = await app_client.post(
            "/api/modules/codelab/stream",
            json={
                "input": "hello",
                "params": {"action": "health"},
            },
            timeout=30.0,
        )
        assert resp.status_code == 200

        events = []
        for line in resp.text.split("\n"):
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))

        event_types = [e.get("type") for e in events]
        assert "task_created" in event_types


@skip_no_opencode
class TestOpenCodeDirectBridge:
    """直接测试 OpenCodeBridge（不经过 FastAPI）。"""

    @pytest.fixture
    def bridge(self):
        from sololab.modules.codelab.bridge import OpenCodeBridge
        return OpenCodeBridge(base_url=f"http://localhost:{os.environ.get('OPENCODE_PORT', 3100)}")

    @pytest.mark.integration
    async def test_direct_health(self, bridge):
        ok = await bridge.health_check()
        assert ok is True
        await bridge.close()

    @pytest.mark.integration
    async def test_direct_create_session(self, bridge):
        session = await bridge.create_session()
        assert "id" in session or "sessionID" in session
        await bridge.close()

    @pytest.mark.integration
    async def test_direct_list_sessions(self, bridge):
        sessions = await bridge.list_sessions()
        assert isinstance(sessions, list)
        await bridge.close()
