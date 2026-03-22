"""Semantic Scholar API 工具。"""

import aiohttp

from sololab.core.tool_registry import ToolBase, ToolResult

_S2_API = "https://api.semanticscholar.org/graph/v1/paper/search"


class SemanticScholarTool(ToolBase):
    """在 Semantic Scholar 搜索论文和引用图谱。"""

    @property
    def name(self) -> str:
        return "scholar_search"

    @property
    def description(self) -> str:
        return "Search Semantic Scholar for papers, citation graphs, and research metadata"

    async def execute(self, params: dict) -> ToolResult:
        """执行 Semantic Scholar 搜索。"""
        query = params.get("query", "")
        if not query:
            return ToolResult(success=False, data={}, error="Query is required")

        limit = params.get("max_results", 5)
        fields = "title,abstract,year,citationCount,authors,url"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    _S2_API,
                    params={"query": query, "limit": limit, "fields": fields},
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    data = await resp.json()
                    if resp.status != 200:
                        return ToolResult(success=False, data={}, error=f"S2 API error: {data}")

                    papers = data.get("data", [])
                    results = [
                        {
                            "title": p.get("title", ""),
                            "abstract": (p.get("abstract") or "")[:500],
                            "year": p.get("year"),
                            "citations": p.get("citationCount", 0),
                            "authors": [a.get("name", "") for a in (p.get("authors") or [])[:5]],
                            "url": p.get("url", ""),
                        }
                        for p in papers
                    ]
                    return ToolResult(
                        success=True,
                        data={"query": query, "results": results},
                    )
        except Exception as e:
            return ToolResult(success=False, data={}, error=f"Scholar search failed: {e}")
