"""Tavily 搜索工具测试 —— 使用真实 API。"""

import pytest

from sololab.tools.tavily_search import TavilySearchTool


class TestTavilySearchTool:

    @pytest.mark.unit
    def test_tool_name(self):
        """工具名应为 web_search。"""
        tool = TavilySearchTool()
        assert tool.name == "web_search"

    @pytest.mark.unit
    async def test_execute_without_query_returns_error(self):
        """无 query 应返回错误。"""
        tool = TavilySearchTool()
        result = await tool.execute({})
        assert not result.success
        assert result.error is not None

    @pytest.mark.unit
    async def test_execute_with_real_query(self):
        """真实 Tavily API 调用应返回结果。"""
        tool = TavilySearchTool()
        result = await tool.execute({"query": "multi-agent AI systems", "max_results": 3})
        assert result.success
        assert len(result.data["results"]) > 0
        assert "title" in result.data["results"][0]
