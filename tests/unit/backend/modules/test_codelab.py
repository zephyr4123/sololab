"""CodeLab 模块单元测试。"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from sololab.modules.codelab.bridge import OpenCodeBridge
from sololab.modules.codelab.module import CodeLabModule
from sololab.core.module_registry import ModuleContext, ModuleManifest, ModuleRequest


# ── Manifest 测试 ──────────────────────────────────


class TestCodeLabManifest:
    """CodeLab 模块清单验证。"""

    @pytest.mark.unit
    def test_manifest_id(self):
        module = CodeLabModule()
        m = module.manifest()
        assert m.id == "codelab"

    @pytest.mark.unit
    def test_manifest_fields_complete(self):
        module = CodeLabModule()
        m = module.manifest()
        assert m.name == "CodeLab"
        assert m.version == "0.1.0"
        assert m.icon == "Code"
        assert "sololab.modules.codelab.module:CodeLabModule" in m.entry_point

    @pytest.mark.unit
    def test_manifest_has_config_schema(self):
        module = CodeLabModule()
        m = module.manifest()
        assert m.config_schema is not None
        props = m.config_schema["properties"]
        assert "opencode_url" in props
        assert "default_model" in props
        assert "timeout_seconds" in props

    @pytest.mark.unit
    def test_manifest_json_matches_class(self):
        """manifest.json 应与 module.py 的 manifest() 一致。"""
        import json
        from pathlib import Path

        manifest_path = Path(__file__).parents[4] / "backend" / "src" / "sololab" / "modules" / "codelab" / "manifest.json"
        with open(manifest_path) as f:
            json_manifest = json.load(f)

        module = CodeLabModule()
        m = module.manifest()
        assert json_manifest["id"] == m.id
        assert json_manifest["name"] == m.name
        assert json_manifest["entry_point"] == m.entry_point


# ── Bridge 测试 ──────────────────────────────────


class TestOpenCodeBridge:
    """OpenCode 桥接层单元测试（Mock HTTP 调用）。"""

    @pytest.mark.unit
    def test_bridge_init_defaults(self):
        bridge = OpenCodeBridge()
        assert bridge._base_url == "http://localhost:3100"
        assert bridge._username == "opencode"
        assert bridge._password is None

    @pytest.mark.unit
    def test_bridge_init_custom(self):
        bridge = OpenCodeBridge(
            base_url="http://opencode:3100/",
            username="admin",
            password="secret",
            timeout=60,
        )
        assert bridge._base_url == "http://opencode:3100"
        assert bridge._username == "admin"
        assert bridge._password == "secret"

    @pytest.mark.unit
    def test_parse_sse_event_with_data(self):
        raw = "event: message\ndata: {\"type\": \"text\", \"content\": \"hello\"}"
        result = OpenCodeBridge._parse_sse_event(raw)
        assert result is not None
        assert result["type"] == "message"
        assert result["content"] == "hello"

    @pytest.mark.unit
    def test_parse_sse_event_no_data(self):
        raw = ": comment only"
        result = OpenCodeBridge._parse_sse_event(raw)
        assert result is None

    @pytest.mark.unit
    def test_parse_sse_event_multiline_data(self):
        raw = "data: {\"type\": \"chunk\",\ndata:  \"text\": \"hello\"}"
        result = OpenCodeBridge._parse_sse_event(raw)
        assert result is not None
        assert result["type"] == "chunk"

    @pytest.mark.unit
    def test_parse_sse_event_invalid_json(self):
        raw = "data: not json"
        result = OpenCodeBridge._parse_sse_event(raw)
        assert result is not None
        assert "raw" in result

    @pytest.mark.unit
    async def test_health_check_success(self):
        bridge = OpenCodeBridge()
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.get = MagicMock(return_value=mock_response)
        mock_session.closed = False
        bridge._session = mock_session

        assert await bridge.health_check() is True

    @pytest.mark.unit
    async def test_health_check_failure(self):
        bridge = OpenCodeBridge()
        mock_session = AsyncMock()
        # health_check catches (aiohttp.ClientError, asyncio.TimeoutError),
        # but a generic Exception bubbles up from the `async with` context.
        # We need the mock to act as a context manager that raises inside.
        import aiohttp
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=aiohttp.ClientError("Connection refused"))
        mock_session.get = MagicMock(return_value=mock_cm)
        mock_session.closed = False
        bridge._session = mock_session

        assert await bridge.health_check() is False

    @pytest.mark.unit
    async def test_create_session(self):
        bridge = OpenCodeBridge()
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"id": "session-123", "title": ""})
        mock_response.raise_for_status = MagicMock()
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_response)
        mock_session.closed = False
        bridge._session = mock_session

        result = await bridge.create_session(directory="/tmp/project")
        assert result["id"] == "session-123"
        mock_session.post.assert_called_once()

    @pytest.mark.unit
    async def test_list_sessions(self):
        bridge = OpenCodeBridge()
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value=[
            {"id": "s1", "title": "Session 1"},
            {"id": "s2", "title": "Session 2"},
        ])
        mock_response.raise_for_status = MagicMock()
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.get = MagicMock(return_value=mock_response)
        mock_session.closed = False
        bridge._session = mock_session

        result = await bridge.list_sessions()
        assert len(result) == 2

    @pytest.mark.unit
    async def test_abort_session(self):
        bridge = OpenCodeBridge()
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_response)
        mock_session.closed = False
        bridge._session = mock_session

        result = await bridge.abort_session("session-123")
        assert result is True

    @pytest.mark.unit
    async def test_reply_permission(self):
        bridge = OpenCodeBridge()
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_response)
        mock_session.closed = False
        bridge._session = mock_session

        result = await bridge.reply_permission("perm-1", allowed=True)
        assert result is True

    @pytest.mark.unit
    async def test_close(self):
        bridge = OpenCodeBridge()
        mock_session = AsyncMock()
        mock_session.closed = False
        bridge._session = mock_session

        await bridge.close()
        mock_session.close.assert_called_once()


# ── Module 测试 ──────────────────────────────────


class TestCodeLabModule:
    """CodeLab 模块生命周期测试。"""

    def _make_ctx(self, **overrides):
        """构造测试用 ModuleContext。"""
        defaults = dict(
            llm_gateway=MagicMock(),
            tool_registry=MagicMock(),
            memory_manager=MagicMock(),
            task_state_manager=MagicMock(),
        )
        defaults.update(overrides)
        return ModuleContext(**defaults)

    @pytest.mark.unit
    async def test_on_load_creates_bridge(self):
        module = CodeLabModule()
        ctx = self._make_ctx()

        with patch("sololab.modules.codelab.module.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                opencode_url="http://test:3100",
                opencode_server_password="",
                opencode_server_username="opencode",
            )
            await module.on_load(ctx)

        assert module._bridge is not None
        assert module._bridge._base_url == "http://test:3100"

    @pytest.mark.unit
    async def test_on_unload_closes_bridge(self):
        module = CodeLabModule()
        mock_bridge = AsyncMock()
        module._bridge = mock_bridge

        await module.on_unload()
        mock_bridge.close.assert_called_once()
        assert module._bridge is None

    @pytest.mark.unit
    async def test_execute_raises_if_not_loaded(self):
        module = CodeLabModule()
        request = ModuleRequest(input="test")
        ctx = self._make_ctx()

        with pytest.raises(RuntimeError, match="Module not loaded"):
            async for _ in module.execute(request, ctx):
                pass

    @pytest.mark.unit
    async def test_execute_health_action(self):
        module = CodeLabModule()
        module._bridge = AsyncMock()
        module._bridge.health_check = AsyncMock(return_value=True)

        request = ModuleRequest(input="", params={"action": "health"})
        ctx = self._make_ctx()

        events = []
        async for event in module.execute(request, ctx):
            events.append(event)

        assert len(events) == 1
        assert events[0]["type"] == "health"
        assert events[0]["ok"] is True

    @pytest.mark.unit
    async def test_execute_sessions_action(self):
        module = CodeLabModule()
        module._bridge = AsyncMock()
        module._bridge.list_sessions = AsyncMock(return_value=[{"id": "s1"}])

        request = ModuleRequest(input="", params={"action": "sessions"})
        ctx = self._make_ctx()

        events = []
        async for event in module.execute(request, ctx):
            events.append(event)

        assert events[0]["type"] == "sessions"
        assert len(events[0]["sessions"]) == 1

    @pytest.mark.unit
    async def test_execute_abort_requires_session_id(self):
        module = CodeLabModule()
        module._bridge = AsyncMock()

        request = ModuleRequest(input="", params={"action": "abort"})
        ctx = self._make_ctx()

        events = []
        async for event in module.execute(request, ctx):
            events.append(event)

        assert events[0]["type"] == "error"

    @pytest.mark.unit
    async def test_execute_chat_creates_session(self):
        module = CodeLabModule()

        mock_bridge = AsyncMock()
        mock_bridge.create_session = AsyncMock(return_value={"id": "new-session"})

        async def mock_send_message(session_id, content):
            yield {"type": "text", "content": "response"}

        mock_bridge.send_message = mock_send_message
        module._bridge = mock_bridge

        request = ModuleRequest(input="write hello world")
        ctx = self._make_ctx()

        events = []
        async for event in module.execute(request, ctx):
            events.append(event)

        event_types = [e["type"] for e in events]
        assert "session_created" in event_types
        assert "status" in event_types
        assert "done" in event_types
