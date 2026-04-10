"""search_literature tool — search academic papers via arXiv, Scholar, and web."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sololab.modules.writer.tools import WriterToolContext

logger = logging.getLogger(__name__)


async def execute(args: dict, ctx: WriterToolContext) -> str:
    """Search for academic literature across multiple sources.

    Args (from LLM):
        query: Search query string.
        max_results: Max results per source (default 3).
    """
    query = args.get("query", "")
    max_results = args.get("max_results", 3)

    if not query:
        return "Error: query is required."

    ctx.emit({"type": "tool", "tool": "search_literature", "status": "running", "query": query})

    all_results: list[dict] = []

    # arXiv search
    arxiv_tool = ctx.tool_registry.get_tool("arxiv_search") if ctx.tool_registry else None
    if arxiv_tool:
        try:
            arxiv_result = await arxiv_tool.execute({"query": query, "max_results": max_results})
            results_data = arxiv_result.data if hasattr(arxiv_result, "data") else arxiv_result
            for paper in (results_data.get("results", []) if isinstance(results_data, dict) else []):
                all_results.append({
                    "title": paper.get("title", ""),
                    "authors": paper.get("authors", []),
                    "year": _extract_year(paper.get("published", "")),
                    "venue": "arXiv",
                    "url": paper.get("url", ""),
                    "abstract": paper.get("summary", "")[:300],
                    "source": "arxiv",
                })
        except Exception as e:
            logger.warning("arXiv search failed: %s", e)

    # Semantic Scholar search
    scholar_tool = ctx.tool_registry.get_tool("scholar_search") if ctx.tool_registry else None
    if scholar_tool:
        try:
            scholar_result = await scholar_tool.execute({"query": query, "max_results": max_results})
            results_data = scholar_result.data if hasattr(scholar_result, "data") else scholar_result
            for paper in (results_data.get("results", []) if isinstance(results_data, dict) else []):
                all_results.append({
                    "title": paper.get("title", ""),
                    "authors": paper.get("authors", []),
                    "year": paper.get("year"),
                    "venue": paper.get("venue", ""),
                    "url": paper.get("url", ""),
                    "abstract": paper.get("abstract", "")[:300],
                    "source": "scholar",
                })
        except Exception as e:
            logger.warning("Scholar search failed: %s", e)

    # Web search (Tavily) for broader context
    web_tool = ctx.tool_registry.get_tool("web_search") if ctx.tool_registry else None
    if web_tool:
        try:
            web_result = await web_tool.execute({"query": f"academic paper {query}", "max_results": 2})
            results_data = web_result.data if hasattr(web_result, "data") else web_result
            for item in (results_data.get("results", []) if isinstance(results_data, dict) else []):
                all_results.append({
                    "title": item.get("title", ""),
                    "authors": [],
                    "year": None,
                    "venue": "Web",
                    "url": item.get("url", ""),
                    "abstract": item.get("content", "")[:300],
                    "source": "web",
                })
        except Exception as e:
            logger.warning("Web search failed: %s", e)

    # Deduplicate by title similarity
    seen_titles: set[str] = set()
    unique_results = []
    for r in all_results:
        normalized = r["title"].lower().strip()
        if normalized and normalized not in seen_titles:
            seen_titles.add(normalized)
            unique_results.append(r)

    ctx.emit({
        "type": "tool",
        "tool": "search_literature",
        "status": "complete",
        "result_count": len(unique_results),
    })

    if not unique_results:
        return f"No results found for query: '{query}'. Try broader search terms."

    # Format results for LLM
    lines = [f"Found {len(unique_results)} papers for '{query}':\n"]
    for i, r in enumerate(unique_results, 1):
        authors_str = ", ".join(r["authors"][:3]) if r["authors"] else "Unknown"
        if len(r.get("authors", [])) > 3:
            authors_str += " et al."
        lines.append(
            f"{i}. **{r['title']}**\n"
            f"   Authors: {authors_str}\n"
            f"   Year: {r.get('year', 'N/A')} | Venue: {r.get('venue', 'N/A')}\n"
            f"   Abstract: {r.get('abstract', 'N/A')}\n"
            f"   URL: {r.get('url', '')}\n"
        )

    return "\n".join(lines)


def _extract_year(date_str: str) -> int | None:
    """Extract year from a date string like '2024-03-15'."""
    if not date_str:
        return None
    try:
        return int(date_str[:4])
    except (ValueError, IndexError):
        return None
