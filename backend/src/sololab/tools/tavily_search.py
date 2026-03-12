"""Tavily web search tool."""

from sololab.core.tool_registry import ToolBase, ToolResult


class TavilySearchTool(ToolBase):
    """Search the web for latest information and industry trends."""

    @property
    def name(self) -> str:
        return "web_search"

    @property
    def description(self) -> str:
        return "Search the web for latest information and industry trends (within 1 year)"

    async def execute(self, params: dict) -> ToolResult:
        """Execute Tavily search."""
        query = params.get("query", "")
        if not query:
            return ToolResult(success=False, data={}, error="Query is required")

        # TODO: Implement Tavily API call
        # from tavily import TavilyClient
        # client = TavilyClient(api_key=settings.tavily_api_key)
        # response = client.search(query=query, search_depth="advanced", max_results=5)
        return ToolResult(
            success=True,
            data={"results": [], "query": query},
            error=None,
        )
