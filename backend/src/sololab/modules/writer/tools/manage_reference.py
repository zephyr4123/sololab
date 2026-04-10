"""manage_reference tool — add or remove references."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sololab.modules.writer.tools import WriterToolContext


async def execute(args: dict, ctx: WriterToolContext) -> str:
    """Add or remove a reference in the document.

    Args (from LLM):
        action: "add" or "remove".
        # For "add":
        title: Paper title.
        authors: List of author names.
        year: Publication year.
        venue: Journal/conference name.
        doi: DOI (optional).
        url: URL (optional).
        # For "remove":
        ref_number: Reference number to remove.
    """
    action = args.get("action", "add")

    if action == "add":
        ref_data = {
            "title": args.get("title", ""),
            "authors": args.get("authors", []),
            "year": args.get("year"),
            "venue": args.get("venue", ""),
            "doi": args.get("doi"),
            "url": args.get("url"),
        }

        if not ref_data["title"]:
            return "Error: title is required to add a reference."

        doc = await ctx.document_manager.add_reference(ctx.doc_id, ref_data)
        if not doc:
            return "Error: Document not found."

        # Find the just-added reference
        refs = doc["references"]
        added = refs[-1] if refs else ref_data
        ref_num = added.get("number", len(refs))

        ctx.emit({
            "type": "reference_added",
            "reference": added,
        })

        return (
            f"Reference [{ref_num}] added: {ref_data['title']} "
            f"({', '.join(ref_data['authors'][:2])}, {ref_data.get('year', 'N/A')}). "
            f"Use [{ref_num}] to cite this paper in the text."
        )

    elif action == "remove":
        ref_number = args.get("ref_number")
        if ref_number is None:
            return "Error: ref_number is required to remove a reference."

        doc = await ctx.document_manager.remove_reference(ctx.doc_id, int(ref_number))
        if not doc:
            return "Error: Document not found."

        ctx.emit({
            "type": "reference_removed",
            "ref_number": ref_number,
        })

        return (
            f"Reference [{ref_number}] removed. "
            f"Remaining references have been renumbered. "
            f"Total references: {len(doc['references'])}."
        )

    return f"Error: Unknown action '{action}'. Use 'add' or 'remove'."
