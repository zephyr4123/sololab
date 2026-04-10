"""insert_figure tool — add a figure to a document section."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sololab.modules.writer.tools import WriterToolContext


async def execute(args: dict, ctx: WriterToolContext) -> str:
    """Insert a figure into a specific section of the document.

    Args (from LLM):
        section_id: Target section ID.
        figure_url: URL/path of the figure image.
        caption: Figure caption text.
        code: Python code that generated the figure (optional, for reproducibility).
    """
    section_id = args.get("section_id", "")
    figure_url = args.get("figure_url", "")
    caption = args.get("caption", "")

    if not figure_url:
        return "Error: figure_url is required."
    if not caption:
        return "Error: caption is required for academic figures."

    figure_data = {
        "section_id": section_id,
        "caption": caption,
        "url": figure_url,
        "code": args.get("code", ""),
    }

    doc = await ctx.document_manager.add_figure(ctx.doc_id, figure_data)
    if not doc:
        return "Error: Document not found."

    # Get figure number
    fig_num = len(doc["figures"])

    ctx.emit({
        "type": "figure_created",
        "figure": {
            "id": doc["figures"][-1]["id"],
            "url": figure_url,
            "caption": caption,
            "number": fig_num,
            "section_id": section_id,
        },
    })

    return (
        f"Figure {fig_num} inserted: '{caption}'\n"
        f"URL: {figure_url}\n"
        f"Section: {section_id}\n"
        f"Reference as 'Figure {fig_num}' in the text."
    )
