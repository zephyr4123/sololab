"""WriterAI system prompt construction."""
from __future__ import annotations

from sololab.modules.writer.templates.base import PaperTemplate


def build_system_prompt(
    template: PaperTemplate,
    document_state: str = "",
    language: str = "auto",
) -> str:
    """Build the system prompt for the WriterAgent.

    Args:
        template: Paper template defining structure and citation format.
        document_state: Current document state summary (sections, word counts).
        language: Target language ("en", "zh", or "auto" to detect from user input).
    """
    sections_list = "\n".join(
        f"  - **{s.title}** ({s.type})"
        + (f" — max {s.max_words} words" if s.max_words else "")
        + (f" — {s.guidelines}" if s.guidelines else "")
        + (" [auto-generated]" if s.auto_generated else "")
        for s in template.sections
    )

    lang_instruction = {
        "en": "Write the paper in **English**.",
        "zh": "Write the paper in **Chinese (中文)**.",
        "auto": "Detect the language from the user's prompt and write in the same language. If unclear, default to English.",
    }.get(language, "Write the paper in **English**.")

    return f"""You are WriterAI, an expert academic paper writer for the SoloLab research platform.
You help researchers produce high-quality papers by searching literature, writing structured content, generating data figures, and managing citations.

## Template: {template.name}
Page limit: {template.page_limit or "none"}
Citation style: {template.citation.style}

### Sections (in order):
{sections_list}

## Language
{lang_instruction}

{f"## Current Document State{chr(10)}{document_state}" if document_state else ""}

## Your Workflow
1. **create_outline** — Initialize the paper structure from the template.
2. **search_literature** — Search for relevant papers before writing each section.
3. **write_section** — Write one section at a time. The content streams to the user in real time.
4. **manage_reference** — Add references as you cite them. Use [N] notation in text.
5. **execute_code** + **insert_figure** — Generate data visualizations when needed.
6. Repeat steps 2-5 for each section until the paper is complete.

## Rules
- **Never fabricate citations.** Only cite papers found through search_literature.
- **Uploaded PDF knowledge is internal context only** — do NOT add them to the reference list.
- Always call search_literature before writing a section that requires citations.
- Use [1], [2], ... notation for in-text citations. manage_reference auto-assigns numbers.
- When the user asks to modify a specific section, use write_section on only that section.
- Use get_document to check the current state before making changes.
- Keep each section focused and within any word limits defined by the template.
- For data analysis or plots, write Python code with matplotlib/plotly via execute_code.

## Citation Format
{template.citation.format}
Max authors before "et al.": {template.citation.max_authors}
"""


def build_section_writing_prompt(
    section_type: str,
    section_title: str,
    instructions: str,
    template: PaperTemplate,
    existing_sections_summary: str = "",
    references_summary: str = "",
    knowledge_context: str = "",
) -> str:
    """Build the prompt for writing a single section.

    Used internally by the write_section tool for its dedicated LLM streaming call.
    """
    section_tmpl = template.get_section(section_type)
    guidelines = section_tmpl.guidelines if section_tmpl else ""
    max_words = section_tmpl.max_words if section_tmpl else None

    parts = [
        f"Write the **{section_title}** section of an academic paper.",
        f"Template: {template.name} ({template.citation.style} citations).",
    ]

    if guidelines:
        parts.append(f"Section guidelines: {guidelines}")
    if max_words:
        parts.append(f"Target length: approximately {max_words} words.")
    if instructions:
        parts.append(f"User instructions: {instructions}")
    if existing_sections_summary:
        parts.append(f"Context from other sections:\n{existing_sections_summary}")
    if references_summary:
        parts.append(f"Available references (cite using [N]):\n{references_summary}")
    if knowledge_context:
        parts.append(f"Internal knowledge (do NOT cite as reference):\n{knowledge_context}")

    parts.append(
        "Output the section content directly as HTML paragraphs. "
        "Use <p>, <ul>, <ol>, <strong>, <em> tags. "
        "Do NOT wrap in markdown code blocks. Do NOT include the section title as a heading."
    )

    return "\n\n".join(parts)
