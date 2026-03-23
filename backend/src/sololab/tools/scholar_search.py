"""Semantic Scholar API 工具。"""

import asyncio
import aiohttp

from sololab.config.settings import get_settings
from sololab.core.tool_registry import ToolBase, ToolResult

_S2_API = "https://api.semanticscholar.org/graph/v1/paper/search"

# 简易限速：确保两次调用间隔至少 1.1 秒
_last_call_time = 0.0


class SemanticScholarTool(ToolBase):
    """在 Semantic Scholar 搜索论文和引用图谱。"""

    @property
    def name(self) -> str:
        return "scholar_search"

    @property
    def description(self) -> str:
        return "Search Semantic Scholar for papers, citation graphs, and research metadata"

    async def execute(self, params: dict) -> ToolResult:
        """执行 Semantic Scholar 搜索（带限速和 API key 支持）。"""
        global _last_call_time

        query = params.get("query", "")
        if not query:
            return ToolResult(success=False, data={}, error="Query is required")

        # 限速：两次调用间隔至少 1.1 秒
        import time
        now = time.monotonic()
        wait = 1.1 - (now - _last_call_time)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call_time = time.monotonic()

        limit = params.get("max_results", 5)
        fields = "title,abstract,year,citationCount,authors,url"

        # 支持可选的 API key（高限速）
        headers = {}
        settings = get_settings()
        s2_key = getattr(settings, "s2_api_key", None) or ""
        if s2_key:
            headers["x-api-key"] = s2_key

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    _S2_API,
                    params={"query": query, "limit": limit, "fields": fields},
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    data = await resp.json()
                    if resp.status == 429:
                        # 限速被触发，返回空结果而非报错（不影响流程）
                        return ToolResult(
                            success=True,
                            data={"query": query, "results": []},
                            error="Semantic Scholar rate limited, skipped",
                        )
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
