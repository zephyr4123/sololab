"""arXiv 论文搜索工具。"""

from sololab.core.tool_registry import ToolBase, ToolResult


class ArxivTool(ToolBase):
    """在 arXiv 搜索预印本论文。"""

    @property
    def name(self) -> str:
        return "arxiv_search"

    @property
    def description(self) -> str:
        return "Search arXiv preprint repository for academic papers"

    async def execute(self, params: dict) -> ToolResult:
        """执行 arXiv 搜索。"""
        query = params.get("query", "")
        max_results = params.get("max_results", 10)
        if not query:
            return ToolResult(success=False, data={}, error="Query is required")

        # TODO: 实现 arXiv API 调用
        # import arxiv
        # search = arxiv.Search(query=query, max_results=max_results, sort_by=arxiv.SortCriterion.Relevance)
        return ToolResult(
            success=True,
            data={"results": [], "query": query, "max_results": max_results},
        )
