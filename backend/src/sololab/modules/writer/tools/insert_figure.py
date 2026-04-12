"""insert_figure tool — embed a figure into a section's content (inline at a placeholder)."""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sololab.modules.writer.tools import WriterToolContext


def _escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


async def execute(args: dict, ctx: WriterToolContext) -> str:
    """Insert a figure into a specific section of the document.

    Args (from LLM):
        section_id: Target section ID.
        figure_url: URL/path of the figure image.
        caption: Figure caption text.
        placeholder: (recommended) Name of the inline placeholder previously
            written into the section text as `[FIGURE: <name>]`. The placeholder
            will be replaced with the rendered figure HTML so the image appears
            inline in the prose. If omitted or not found, the figure is appended
            at the end of the section as a fallback.
        code: Python code that generated the figure (optional, for reproducibility).
    """
    section_id = args.get("section_id", "")
    figure_url = args.get("figure_url", "")
    caption = args.get("caption", "")
    placeholder = (args.get("placeholder") or "").strip()

    if not figure_url:
        return "Error: figure_url is required."
    if not caption:
        return "Error: caption is required for academic figures."

    figure_data = {
        "section_id": section_id,
        "caption": caption,
        "url": figure_url,
        "code": args.get("code", ""),
        "placeholder": placeholder,
    }

    doc = await ctx.document_manager.add_figure(ctx.doc_id, figure_data)
    if not doc:
        return "Error: Document not found."

    fig_record = doc["figures"][-1]
    fig_num = fig_record.get("order", len(doc["figures"]))
    fig_id = fig_record.get("id", "")

    # Build the figure HTML that will be embedded in section.content
    fig_html = (
        f'<figure data-fig-id="{fig_id}" data-fig-num="{fig_num}">'
        f'<img src="{figure_url}" alt="{_escape(caption)[:120]}"/>'
        f'<figcaption><strong>图 {fig_num}.</strong> {_escape(caption)}</figcaption>'
        f"</figure>"
    )

    inlined = False
    section = next((s for s in doc.get("sections", []) if s.get("id") == section_id), None)
    if section:
        old_content = section.get("content", "") or ""
        new_content = old_content

        # Try the recommended placeholder forms first, then fall back to the
        # generic `[FIGURE: ...]` pattern matching ANY placeholder name.
        candidates: list[str] = []
        if placeholder:
            candidates.extend(
                [
                    f"[FIGURE: {placeholder}]",
                    f"[FIGURE:{placeholder}]",
                    f"[Figure: {placeholder}]",
                    f"<!-- FIGURE: {placeholder} -->",
                ]
            )

        for pat in candidates:
            if pat in new_content:
                new_content = new_content.replace(pat, fig_html, 1)
                inlined = True
                break

        # Generic fallback: any [FIGURE: ...] still in the section
        if not inlined:
            generic = re.search(r"\[FIGURE:\s*[^\]]+\]", new_content)
            if generic:
                new_content = new_content[: generic.start()] + fig_html + new_content[generic.end() :]
                inlined = True

        # Last resort: append at end of section content so the figure is at
        # least visible. Frontends/exporters render section.content directly,
        # so this guarantees the figure shows up somewhere.
        if not inlined:
            new_content = (old_content.rstrip() + "\n" + fig_html).strip()

        if new_content != old_content:
            await ctx.document_manager.update_section(
                ctx.doc_id, section_id, content=new_content
            )
            # Notify the frontend so it can refresh section.content in its
            # local store — otherwise the inlined figure stays invisible until
            # the next page reload (DB has the right content but the live
            # preview is built from streamed deltas).
            ctx.emit(
                {
                    "type": "section_content_updated",
                    "section_id": section_id,
                    "content": new_content,
                }
            )

    ctx.emit(
        {
            "type": "figure_created",
            "figure": {
                "id": fig_id,
                "url": figure_url,
                "caption": caption,
                "number": fig_num,
                "section_id": section_id,
                "inlined": inlined,
            },
        }
    )

    location = "inline at placeholder" if inlined else "appended to end of section"
    return (
        f"Figure {fig_num} inserted ({location}): '{caption}'\n"
        f"URL: {figure_url}\n"
        f"Section: {section_id}\n"
        f"Reference as 'Figure {fig_num}' in the text."
    )
