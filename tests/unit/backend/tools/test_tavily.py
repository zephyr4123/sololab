"""Unit tests for Tavily search tool."""

import pytest

from sololab.tools.tavily_search import TavilySearchTool


class TestTavilySearchTool:

    @pytest.mark.unit
    def test_tool_name(self):
        """Tool name should be 'web_search'."""
        tool = TavilySearchTool()
        assert tool.name == "web_search"

    @pytest.mark.unit
    async def test_execute_without_query_returns_error(self):
        """Execute without query should return error."""
        tool = TavilySearchTool()
        result = await tool.execute({})
        assert not result.success
        assert result.error is not None
