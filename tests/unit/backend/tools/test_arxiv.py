"""arXiv 搜索工具测试。"""

import pytest

from sololab.tools.arxiv_search import ArxivTool


class TestArxivTool:

    @pytest.mark.unit
    def test_tool_name(self):
        """工具名应为 arxiv_search。"""
        tool = ArxivTool()
        assert tool.name == "arxiv_search"

    @pytest.mark.unit
    async def test_execute_without_query_returns_error(self):
        """无 query 应返回错误。"""
        tool = ArxivTool()
        result = await tool.execute({})
        assert not result.success

    @pytest.mark.unit
    async def test_parse_atom_with_sample(self):
        """XML 解析应能正确提取论文信息。"""
        sample_xml = """<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2301.00001v1</id>
            <title>Test Paper Title</title>
            <summary>This is a test summary.</summary>
            <published>2024-01-15T00:00:00Z</published>
            <author><name>Alice</name></author>
            <author><name>Bob</name></author>
          </entry>
        </feed>"""
        results = ArxivTool._parse_atom(sample_xml)
        assert len(results) == 1
        assert results[0]["title"] == "Test Paper Title"
        assert results[0]["summary"] == "This is a test summary."
        assert "Alice" in results[0]["authors"]
