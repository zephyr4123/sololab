"""create_outline tool — generate document structure from template."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sololab.modules.writer.tools import WriterToolContext


async def execute(args: dict, ctx: WriterToolContext) -> str:
    """Create the document outline based on the template.

    Args (from LLM):
        title: Paper title.
        template_id: Template to use (default: from session config).
        language: Paper language ("en" or "zh").
    """
    title = args.get("title", "Untitled Paper")
    template_id = args.get("template_id") or ctx.template_id
    language = args.get("language", ctx.language)

    template = ctx.template_registry.get(template_id)
    if not template:
        return f"Error: Template '{template_id}' not found. Available: {ctx.template_registry.list_ids()}"

    # Build sections from template
    sections = []
    for i, sec_tmpl in enumerate(template.sections):
        if sec_tmpl.auto_generated:
            continue  # References section is auto-generated, skip in outline
        sections.append({
            "id": f"sec_{uuid.uuid4().hex[:8]}",
            "type": sec_tmpl.type,
            "title": sec_tmpl.title,
            "content": "",
            "order": i,
            "status": "empty",
            "word_count": 0,
        })

    # Check if document already exists for this session
    existing = await ctx.document_manager.get(ctx.doc_id)
    if existing:
        # Update existing document
        doc = await ctx.document_manager.init_sections(ctx.doc_id, sections)
        if doc:
            await ctx.document_manager.update(ctx.doc_id, title=title, language=language, template_id=template_id)
    else:
        # Create new document
        doc = await ctx.document_manager.create(
            session_id=ctx.session_id,
            template_id=template_id,
            language=language,
            title=title,
            sections=sections,
        )
        ctx.doc_id = doc["doc_id"]

    ctx.emit({
        "type": "outline_created",
        "doc_id": ctx.doc_id,
        "title": title,
        "template_id": template_id,
        "sections": [{"id": s["id"], "type": s["type"], "title": s["title"]} for s in sections],
    })

    # Format response for LLM
    lines = [
        f"Outline created for '{title}' (template: {template.name}, language: {language}).",
        f"Document ID: {ctx.doc_id}",
        "",
        "Sections:",
    ]
    for sec in sections:
        lines.append(f"  - [{sec['id']}] {sec['title']} ({sec['type']})")

    lines.append(f"\nNext: search_literature for the Introduction, then write_section.")
    return "\n".join(lines)
