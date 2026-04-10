"""search_knowledge tool — query uploaded PDF knowledge base."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sololab.modules.writer.tools import WriterToolContext

logger = logging.getLogger(__name__)


async def execute(args: dict, ctx: WriterToolContext) -> str:
    """Search the uploaded PDF knowledge base for relevant content.

    The results are internal context only — do NOT cite them as references.

    Args (from LLM):
        query: Search query.
        top_k: Number of results (default 5).
    """
    query = args.get("query", "")
    top_k = args.get("top_k", 5)

    if not query:
        return "Error: query is required."

    if not ctx.document_pipeline:
        return "No knowledge base available. Upload PDFs first via the knowledge panel."

    try:
        results = await ctx.document_pipeline.search(query=query, top_k=top_k)
    except Exception as e:
        logger.warning("Knowledge search failed: %s", e)
        return f"Knowledge search failed: {e}"

    if not results:
        return f"No relevant content found for '{query}' in the knowledge base."

    lines = [f"Found {len(results)} relevant passages (internal knowledge only — do NOT cite as references):\n"]
    for i, chunk in enumerate(results, 1):
        content = chunk.get("content", "")[:500]
        source = chunk.get("filename", "unknown")
        lines.append(f"{i}. [{source}]\n{content}\n")

    return "\n".join(lines)
