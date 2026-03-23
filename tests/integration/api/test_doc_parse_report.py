"""DocParseTool 与报告导出集成测试。"""

import pytest
import httpx


class TestDocParseIntegration:
    """DocParseTool 集成测试。"""

    @pytest.fixture
    async def app_client(self):
        from sololab.main import app
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            async with app.router.lifespan_context(app):
                yield client, app

    @pytest.mark.integration
    async def test_doc_parse_tool_registered(self, app_client):
        """doc_parse 工具应已注册到工具注册表。"""
        _, app = app_client
        tool_registry = app.state.tool_registry
        tool = tool_registry.get_tool("doc_parse")
        assert tool is not None
        assert tool.name == "doc_parse"

    @pytest.mark.integration
    async def test_doc_parse_tool_has_pipeline(self, app_client):
        """doc_parse 工具应已注入 DocumentPipeline。"""
        _, app = app_client
        tool_registry = app.state.tool_registry
        tool = tool_registry.get_tool("doc_parse")
        if app.state.document_pipeline:
            assert tool._pipeline is not None
            assert tool._pipeline is app.state.document_pipeline
        else:
            # DB 不可用时 pipeline 为 None
            assert tool._pipeline is None

    @pytest.mark.integration
    async def test_tools_api_lists_doc_parse(self, app_client):
        """GET /api/tools 应列出 doc_parse。"""
        client, _ = app_client
        resp = await client.get("/api/tools")
        assert resp.status_code == 200
        tools = resp.json()
        names = [t["name"] for t in tools]
        assert "doc_parse" in names

    @pytest.mark.integration
    async def test_report_endpoint_with_ideaspark(self, app_client):
        """POST /modules/ideaspark/report 端点应可访问（不真实执行模块）。"""
        client, _ = app_client
        # 发送空 ideas 列表触发 400，验证端点可达
        resp = await client.post(
            "/api/modules/ideaspark/report",
            json={"topic": "test", "ideas": []},
        )
        # 空 ideas 应返回 400
        assert resp.status_code == 400
