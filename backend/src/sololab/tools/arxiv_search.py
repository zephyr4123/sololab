"""arXiv 论文搜索工具。"""

import xml.etree.ElementTree as ET

import aiohttp

from sololab.core.tool_registry import ToolBase, ToolResult

_ARXIV_API = "https://export.arxiv.org/api/query"


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
        if not query:
            return ToolResult(success=False, data={}, error="Query is required")

        max_results = params.get("max_results", 5)
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    _ARXIV_API,
                    params={
                        "search_query": f"all:{query}",
                        "start": 0,
                        "max_results": max_results,
                        "sortBy": "relevance",
                        "sortOrder": "descending",
                    },
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    text = await resp.text()
                    results = self._parse_atom(text)
                    return ToolResult(
                        success=True,
                        data={"query": query, "results": results},
                    )
        except Exception as e:
            return ToolResult(success=False, data={}, error=f"arXiv search failed: {e}")

    @staticmethod
    def _parse_atom(xml_text: str) -> list:
        """解析 arXiv Atom XML 响应。"""
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(xml_text)
        results = []
        for entry in root.findall("atom:entry", ns):
            title_el = entry.find("atom:title", ns)
            summary_el = entry.find("atom:summary", ns)
            published_el = entry.find("atom:published", ns)
            link_el = entry.find("atom:id", ns)
            authors = [a.find("atom:name", ns).text for a in entry.findall("atom:author", ns) if a.find("atom:name", ns) is not None]
            results.append({
                "title": title_el.text.strip() if title_el is not None else "",
                "summary": summary_el.text.strip()[:500] if summary_el is not None else "",
                "authors": authors[:5],
                "published": published_el.text[:10] if published_el is not None else "",
                "url": link_el.text if link_el is not None else "",
            })
        return results
