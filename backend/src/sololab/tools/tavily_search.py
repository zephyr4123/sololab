"""Tavily 网络搜索工具。"""

import aiohttp

from sololab.config.settings import get_settings
from sololab.core.tool_registry import ToolBase, ToolResult


class TavilySearchTool(ToolBase):
    """Search the web for current information via Tavily."""

    parameters_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Web search query"},
            "max_results": {
                "type": "integer",
                "description": "Maximum number of results to return",
                "default": 5,
            },
        },
        "required": ["query"],
    }

    @property
    def name(self) -> str:
        return "web_search"

    @property
    def description(self) -> str:
        return "Search the web for latest information and industry trends (within 1 year)"

    async def execute(self, params: dict) -> ToolResult:
        """执行 Tavily 搜索。"""
        query = params.get("query", "")
        if not query:
            return ToolResult(success=False, data={}, error="Query is required")

        settings = get_settings()
        api_key = settings.tavily_api_key
        if not api_key:
            return ToolResult(success=False, data={}, error="TAVILY_API_KEY not configured")

        max_results = params.get("max_results", 5)
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": api_key,
                        "query": query,
                        "search_depth": "basic",
                        "max_results": max_results,
                        "include_answer": True,
                    },
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    data = await resp.json()
                    if resp.status != 200:
                        return ToolResult(success=False, data={}, error=f"Tavily API error: {data}")

                    results = [
                        {
                            "title": r.get("title", ""),
                            "url": r.get("url", ""),
                            "content": r.get("content", "")[:500],
                        }
                        for r in data.get("results", [])
                    ]
                    return ToolResult(
                        success=True,
                        data={
                            "query": query,
                            "answer": data.get("answer", ""),
                            "results": results,
                        },
                    )
        except Exception as e:
            return ToolResult(success=False, data={}, error=f"Tavily search failed: {e}")
