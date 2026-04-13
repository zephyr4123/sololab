"""search_knowledge tool — query uploaded PDF knowledge base."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sololab.modules.writer.tools import WriterToolContext

logger = logging.getLogger(__name__)


async def execute(args: dict, ctx: WriterToolContext) -> str:
    """Search this document's uploaded attachments for relevant content.

    Attachments are scoped to the current document (project_id = f"writer:{doc_id}"),
    so results never leak between sessions. The results are internal context
    only — do NOT cite them as references.

    Args (from LLM):
        query: Search query.
        top_k: Number of results (default 5).
    """
    query = args.get("query", "")
    top_k = args.get("top_k", 5)

    if not query:
        return "Error: query is required."

    if not ctx.document_pipeline:
        return "No knowledge base available. Upload attachments first via the + menu."

    if not ctx.doc_id:
        # Should not normally happen — agent runs always have a doc_id by now.
        return "No document is active; attachments are scoped per document."

    scope = f"writer:{ctx.doc_id}"

    try:
        results = await ctx.document_pipeline.search(
            query=query,
            top_k=top_k,
            project_id=scope,
        )
    except Exception as e:
        logger.warning("Knowledge search failed: %s", e)
        return f"Knowledge search failed: {e}"

    if not results:
        return f"No relevant content found for '{query}' in this document's attachments."

    lines = [
        f"Found {len(results)} relevant passages from this document's attachments "
        "(internal knowledge only — do NOT cite as references):\n"
    ]
    for i, chunk in enumerate(results, 1):
        content = chunk.get("content", "")[:500]
        source = chunk.get("filename", "unknown")
        lines.append(f"{i}. [{source}]\n{content}\n")

    return "\n".join(lines)
