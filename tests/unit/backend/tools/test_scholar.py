"""Semantic Scholar 搜索工具测试。"""

import pytest

from sololab.tools.scholar_search import SemanticScholarTool


class TestSemanticScholarTool:

    @pytest.mark.unit
    def test_tool_name(self):
        """工具名应为 scholar_search。"""
        tool = SemanticScholarTool()
        assert tool.name == "scholar_search"

    @pytest.mark.unit
    async def test_execute_without_query_returns_error(self):
        """无 query 应返回错误。"""
        tool = SemanticScholarTool()
        result = await tool.execute({})
        assert not result.success

    @pytest.mark.unit
    async def test_execute_with_real_query(self):
        """真实 Semantic Scholar API 调用（可能因限速失败）。"""
        tool = SemanticScholarTool()
        result = await tool.execute({"query": "multi-agent brainstorming", "max_results": 3})
        # API 可能返回 429 限速，两种结果都可接受
        if result.success:
            assert len(result.data["results"]) > 0
            assert "title" in result.data["results"][0]
        else:
            assert "429" in (result.error or "") or "Too Many" in (result.error or "")
