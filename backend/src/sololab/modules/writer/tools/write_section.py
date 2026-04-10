"""write_section tool — stream-write a section via independent LLM call.

This is the core tool: it issues a separate streaming LLM request,
forwards each token as an SSE section_stream event, and saves the
completed content to the DocumentManager.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, AsyncGenerator

from sololab.modules.writer.prompts.system_prompt import build_section_writing_prompt

if TYPE_CHECKING:
    from sololab.modules.writer.tools import WriterToolContext

logger = logging.getLogger(__name__)


async def execute(args: dict, ctx: WriterToolContext) -> AsyncGenerator[dict | str, None]:
    """Write (or rewrite) a section with real-time streaming.

    This is an async generator — it yields SSE event dicts during streaming
    and a final string result for the agent's tool response.

    Args (from LLM):
        section_id: ID of the section to write.
        instructions: Additional writing instructions from the user or agent.
    """
    section_id = args.get("section_id", "")
    instructions = args.get("instructions", "")

    if not section_id:
        yield "Error: section_id is required."
        return

    # Get current document state
    doc = await ctx.document_manager.get(ctx.doc_id)
    if not doc:
        yield "Error: Document not found. Use create_outline first."
        return

    # Find the target section
    target_section = None
    for sec in doc["sections"]:
        if sec["id"] == section_id:
            target_section = sec
            break

    if not target_section:
        yield f"Error: Section '{section_id}' not found in document."
        return

    # Get template
    template = ctx.template_registry.get(doc["template_id"])
    if not template:
        yield f"Error: Template '{doc['template_id']}' not found."
        return

    # Build context from other completed sections
    existing_summary_parts = []
    for sec in doc["sections"]:
        if sec["id"] != section_id and sec["status"] == "complete" and sec.get("content"):
            # Include a truncated summary of completed sections
            content_preview = sec["content"][:500]
            existing_summary_parts.append(f"**{sec['title']}** ({sec['word_count']} words):\n{content_preview}...")

    existing_sections_summary = "\n\n".join(existing_summary_parts) if existing_summary_parts else ""

    # Build references summary
    refs_summary = ""
    if doc["references"]:
        ref_lines = []
        for ref in doc["references"]:
            ref_lines.append(f"[{ref['number']}] {ref.get('title', '')} ({ref.get('year', 'N/A')})")
        refs_summary = "\n".join(ref_lines)

    # Build the section-writing prompt
    writing_prompt = build_section_writing_prompt(
        section_type=target_section["type"],
        section_title=target_section["title"],
        instructions=instructions,
        template=template,
        existing_sections_summary=existing_sections_summary,
        references_summary=refs_summary,
    )

    # Mark section as writing
    await ctx.document_manager.update_section(ctx.doc_id, section_id, status="writing")

    yield {
        "type": "section_start",
        "section_id": section_id,
        "title": target_section["title"],
    }

    # Stream the LLM response
    messages = [
        {"role": "system", "content": "You are an expert academic writer. Output section content as clean HTML paragraphs."},
        {"role": "user", "content": writing_prompt},
    ]

    full_content = ""
    try:
        async for chunk in ctx.llm_gateway.stream(
            messages=messages,
            temperature=0.7,
        ):
            full_content += chunk
            yield {
                "type": "section_stream",
                "section_id": section_id,
                "delta": chunk,
            }
    except Exception as e:
        logger.exception("Streaming failed for section %s", section_id)
        await ctx.document_manager.update_section(ctx.doc_id, section_id, status="empty")
        yield {"type": "error", "message": f"Section writing failed: {e}"}
        yield f"Error writing section: {e}"
        return

    # Save completed content
    updated_doc = await ctx.document_manager.update_section(
        ctx.doc_id, section_id,
        content=full_content,
        status="complete",
    )

    word_count = 0
    if updated_doc:
        for sec in updated_doc["sections"]:
            if sec["id"] == section_id:
                word_count = sec.get("word_count", 0)
                break

    yield {
        "type": "section_complete",
        "section_id": section_id,
        "word_count": word_count,
    }

    # Final result string for the agent
    yield (
        f"Section '{target_section['title']}' written successfully. "
        f"Word count: {word_count}. Status: complete."
    )
