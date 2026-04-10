"""get_document tool — returns current document state to the agent."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sololab.modules.writer.tools import WriterToolContext


async def execute(args: dict, ctx: WriterToolContext) -> str:
    """Return document state summary or a specific section's content.

    Args (from LLM):
        section_id: (optional) If provided, return that section's full content.
    """
    doc = await ctx.document_manager.get(ctx.doc_id)
    if not doc:
        return "Error: No document found. Use create_outline first."

    section_id = args.get("section_id")

    if section_id:
        for sec in doc["sections"]:
            if sec["id"] == section_id:
                content = sec.get("content", "")
                return (
                    f"Section: {sec['title']} ({sec['type']})\n"
                    f"Status: {sec['status']}\n"
                    f"Word count: {sec.get('word_count', 0)}\n"
                    f"Content:\n{content[:3000]}"
                )
        return f"Error: Section '{section_id}' not found."

    # Return overview
    lines = [
        f"Document: {doc.get('title', 'Untitled')}",
        f"Template: {doc['template_id']} | Language: {doc['language']} | Status: {doc['status']}",
        f"Total words: {doc['word_count']}",
        "",
        "Sections:",
    ]
    for sec in doc["sections"]:
        status_icon = {"empty": "○", "writing": "◐", "complete": "●"}.get(sec["status"], "?")
        lines.append(
            f"  {status_icon} [{sec['id']}] {sec['title']} — {sec.get('word_count', 0)} words ({sec['status']})"
        )

    if doc["references"]:
        lines.append(f"\nReferences: {len(doc['references'])} cited")
    if doc["figures"]:
        lines.append(f"Figures: {len(doc['figures'])}")

    return "\n".join(lines)
