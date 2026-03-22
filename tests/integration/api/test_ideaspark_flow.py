"""IdeaSpark 完整流程集成测试。"""

import pytest
import httpx


class TestIdeaSparkFlow:
    """测试 IdeaSpark 模块的完整 SSE 流。"""

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
    async def test_ideaspark_module_loaded(self, app_client):
        """IdeaSpark 模块应自动加载。"""
        resp = await app_client.get("/api/modules")
        modules = resp.json()
        assert any(m["id"] == "ideaspark" for m in modules)

    @pytest.mark.integration
    async def test_tools_registered(self, app_client):
        """外部工具应已注册。"""
        resp = await app_client.get("/api/tools")
        tools = resp.json()
        tool_names = [t["name"] for t in tools]
        assert "web_search" in tool_names
        assert "arxiv_search" in tool_names
        assert "scholar_search" in tool_names

    @pytest.mark.integration
    async def test_ideaspark_stream_produces_events(self, app_client):
        """POST /api/modules/ideaspark/stream 应产出 SSE 事件。

        注意：这是一个真实 LLM 调用测试，可能需要 1-3 分钟。
        我们只验证前几个事件的格式，然后取消连接。
        """
        import json

        resp = await app_client.post(
            "/api/modules/ideaspark/stream",
            json={"input": "AI for scientific discovery", "params": {"max_rounds": 1, "top_k": 3}},
            timeout=180.0,
        )
        assert resp.status_code == 200

        events = []
        for line in resp.text.split("\n"):
            if line.startswith("data: "):
                event = json.loads(line[6:])
                events.append(event)

        # 至少应有 task_created + status + done
        event_types = [e.get("type") for e in events]
        assert "task_created" in event_types
        assert "status" in event_types

        # 验证 task_created 包含 task_id
        task_event = next(e for e in events if e["type"] == "task_created")
        assert "task_id" in task_event

    @pytest.mark.integration
    async def test_tavily_tool_real_call(self):
        """Tavily 工具真实 API 调用。"""
        from sololab.tools.tavily_search import TavilySearchTool

        tool = TavilySearchTool()
        result = await tool.execute({"query": "latest AI research breakthroughs 2024"})
        assert result.success
        assert len(result.data["results"]) > 0
