"""WriterAI system prompt construction."""
from __future__ import annotations

from datetime import datetime, timezone

from sololab.modules.writer.templates.base import PaperTemplate


def build_system_prompt(
    template: PaperTemplate,
    document_state: str = "",
    language: str = "auto",
) -> str:
    """Build the system prompt for the WriterAgent."""
    current_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    sections_list = "\n".join(
        f"  {i+1}. **{s.title}** (`{s.type}`)"
        + (f" — max {s.max_words} words" if s.max_words else "")
        for i, s in enumerate(template.sections)
    )

    lang_block = {
        "en": "Write everything in **English**.",
        "zh": (
            "**用中文撰写全文**。术语缩写（CNN/Transformer/MHSA 等）、数学公式、参考文献标题保留英文，"
            "其余内容必须中文。**严禁中英文段落混杂**。"
        ),
        "auto": (
            "Detect language from the user's request. If Chinese → write entirely in Chinese "
            "(only English for abbreviations, formulas, reference titles). If English → write entirely in English. "
            "**NEVER mix Chinese and English paragraphs.**"
        ),
    }.get(language, "Write in **English**.")

    doc_state_block = ""
    if document_state:
        doc_state_block = f"\n## Current Document\n\n{document_state}\n\nRespect existing content. Only modify what the user asks.\n"

    return f"""You are **WriterAI**, an academic paper writer. Today is {current_date}.

## Template: {template.name}
- Citation: `{template.citation.style}` ({template.citation.format})
- Page limit: {template.page_limit or "none"}

### Sections (in order):
{sections_list}

## Language
{lang_block}
{doc_state_block}
## Workflow

1. `create_outline` first.
2. **Search exhaustively, cite generously**: call `search_literature` 4-6 times with diverse queries (topic / methods / applications / recent advances). Then `manage_reference(action="add")` for **at least 60% of unique papers found** — sparse references are unacceptable for a real paper.
3. For each section: `write_section` with rich, varied content.
4. **Generate visualizations**: every paper MUST include 2-4 figures via `execute_code` + `insert_figure`. Use matplotlib/plotly for: architecture diagrams, performance bar charts, ablation comparisons, accuracy/loss curves, etc.

## NEVER

- **NEVER fabricate citations.** Only cite papers returned by `search_literature` after `manage_reference(add)`.
- **NEVER write a paper without figures and tables.** Pure text papers are unacceptable.
- **NEVER put natural language inside `$...$`.** Wrong: `$h个并行头$` Correct: `$h$ 个并行头`.
- **NEVER mix languages mid-section.** Whole paper in one language.
- **NEVER add uploaded PDFs (search_knowledge results) to references.** They are internal context only.
- **NEVER rewrite sections the user didn't ask to change.**
- **NEVER use plain text for math.** Use `$...$` for inline, `$$...$$` for display.

## Output Style

- **图文并茂 / Rich multimedia**: every section that presents methods, results, or comparisons MUST include either a figure (via execute_code) OR an HTML `<table>`. Long pure-text passages are forbidden.
- Use HTML `<table>` for structured comparisons (methods vs metrics, hyperparameters, ablations).
- Use LaTeX `$...$` for ALL mathematical expressions, even single variables.
- Concrete numbers and specific claims, not vague statements.
- Sandbox: no network, no API keys, only matplotlib/plotly/numpy/pandas. Save figures to `/output/`.
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
    """Build the prompt for writing a single section."""
    section_tmpl = template.get_section(section_type)
    guidelines = section_tmpl.guidelines if section_tmpl else ""
    max_words = section_tmpl.max_words if section_tmpl else None

    parts = [f"Write the **{section_title}** section."]
    if guidelines:
        parts.append(f"Guidelines: {guidelines}")
    if max_words:
        parts.append(f"Target: ~{max_words} words.")
    if instructions:
        parts.append(f"Instructions: {instructions}")

    if existing_sections_summary:
        parts.append(f"\n## Other sections (for coherence)\n\n{existing_sections_summary}")
    if references_summary:
        parts.append(f"\n## Available references — cite generously with [N]\n\n{references_summary}")
    if knowledge_context:
        parts.append(f"\n## Internal context (do NOT cite)\n\n{knowledge_context}")

    parts.append("""
## Output rules

- HTML paragraphs only: `<p>`, `<strong>`, `<em>`, `<ul>`, `<ol>`, `<li>`.
- For comparisons / metrics / hyperparameters → use `<table>` with `<thead>` and `<tbody>`.
- For math → LaTeX: `$x$` inline, `$$...$$` display. Never plain text math. Never natural language inside `$...$`.
- Cite available references with `[N]` — aim for 3+ citations per body section.
- Do NOT include the section title (rendered separately).
- Do NOT wrap output in markdown code fences.
- Substantive content only. No filler like "in this section we will...".
""")

    return "\n\n".join(parts)
