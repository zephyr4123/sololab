"""WriterAI tool definitions — OpenAI function calling schemas and dispatch.

Each tool is a separate module with an `execute(args, ctx)` function.
write_section is special: it's an async generator that yields SSE events.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from sololab.modules.writer.document import DocumentManager
from sololab.modules.writer.sandbox.executor import SandboxExecutor
from sololab.modules.writer.templates.registry import TemplateRegistry


@dataclass
class WriterToolContext:
    """Shared context passed to all writer tools."""

    document_manager: DocumentManager
    template_registry: TemplateRegistry
    sandbox_executor: SandboxExecutor | None
    llm_gateway: Any  # LLMGateway
    tool_registry: Any  # ToolRegistry (for external tools: arXiv, Scholar, Tavily)
    document_pipeline: Any | None  # DocumentPipeline (for knowledge search)
    doc_id: str  # Current document ID (mutable — set by create_outline)
    session_id: str
    template_id: str  # Default template
    language: str  # Default language
    emit: Callable[[dict], None] = field(default=lambda event: None)


# ── OpenAI Function Calling Schemas ─────────────────────

WRITER_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_literature",
            "description": "Search academic literature (arXiv, Semantic Scholar, web) for relevant papers. Always call this before writing a section that needs citations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query for academic papers"},
                    "max_results": {"type": "integer", "description": "Max results per source (default 3)", "default": 3},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_outline",
            "description": "Create the paper outline/structure from the template. Call this first before writing any sections.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Paper title"},
                    "template_id": {"type": "string", "description": "Template ID (nature, cvpr, iccv, ieee, acm, chinese_journal)"},
                    "language": {"type": "string", "description": "Paper language: 'en' or 'zh'", "enum": ["en", "zh"]},
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_section",
            "description": "Write or rewrite a specific section of the paper. Content streams to the user in real time. Only write one section per call.",
            "parameters": {
                "type": "object",
                "properties": {
                    "section_id": {"type": "string", "description": "Section ID (from the outline)"},
                    "instructions": {"type": "string", "description": "Specific instructions for this section (focus, tone, key points to cover)"},
                },
                "required": ["section_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_reference",
            "description": "Add or remove a reference. Use 'add' after finding papers via search_literature. Reference numbers are auto-assigned.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["add", "remove"], "description": "Action to perform"},
                    "title": {"type": "string", "description": "Paper title (for 'add')"},
                    "authors": {"type": "array", "items": {"type": "string"}, "description": "Author names (for 'add')"},
                    "year": {"type": "integer", "description": "Publication year (for 'add')"},
                    "venue": {"type": "string", "description": "Journal/conference name (for 'add')"},
                    "doi": {"type": "string", "description": "DOI (optional, for 'add')"},
                    "url": {"type": "string", "description": "URL (optional, for 'add')"},
                    "ref_number": {"type": "integer", "description": "Reference number to remove (for 'remove')"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "execute_code",
            "description": "Execute Python code in a secure sandbox to generate data visualizations (matplotlib, plotly, pandas). The sandbox has no network access and no API keys.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to execute. Save figures to /output/ directory."},
                    "description": {"type": "string", "description": "Brief description of what the code does"},
                },
                "required": ["code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "insert_figure",
            "description": "Insert a generated figure into a document section. Call AFTER execute_code produces a figure. The figure replaces the inline `[FIGURE: <placeholder>]` marker you wrote earlier in the section text — always pass `placeholder` so the image flows with the prose instead of piling up at the end.",
            "parameters": {
                "type": "object",
                "properties": {
                    "section_id": {"type": "string", "description": "Target section ID"},
                    "figure_url": {"type": "string", "description": "Figure URL from execute_code output"},
                    "caption": {"type": "string", "description": "Figure caption (required for academic papers)"},
                    "placeholder": {"type": "string", "description": "Name of the inline `[FIGURE: <name>]` marker previously written into the section text. The marker is replaced with the actual image at that exact spot."},
                    "code": {"type": "string", "description": "Python code that generated the figure (for reproducibility)"},
                },
                "required": ["figure_url", "caption", "placeholder"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_knowledge",
            "description": "Search the uploaded PDF knowledge base. Results are INTERNAL context only — do NOT add them to the reference list.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "top_k": {"type": "integer", "description": "Number of results (default 5)", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_document",
            "description": "Get the current document state (section list, word counts, status) or a specific section's full content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "section_id": {"type": "string", "description": "If provided, return this section's full content. Otherwise return overview."},
                },
                "required": [],
            },
        },
    },
]


# ── Tool Dispatch ───────────────────────────────────────

# Streaming tools (async generators yielding events + final string)
STREAMING_TOOLS = {"write_section"}


async def dispatch_tool(name: str, args: dict, ctx: WriterToolContext):
    """Dispatch a tool call. Returns string result or async generator for streaming tools."""
    from sololab.modules.writer.tools import (
        create_outline,
        execute_code,
        get_document,
        insert_figure,
        manage_reference,
        search_knowledge,
        search_literature,
        write_section,
    )

    tool_map = {
        "search_literature": search_literature.execute,
        "create_outline": create_outline.execute,
        "write_section": write_section.execute,
        "manage_reference": manage_reference.execute,
        "execute_code": execute_code.execute,
        "insert_figure": insert_figure.execute,
        "search_knowledge": search_knowledge.execute,
        "get_document": get_document.execute,
    }

    func = tool_map.get(name)
    if not func:
        return f"Error: Unknown tool '{name}'."

    if name in STREAMING_TOOLS:
        return func(args, ctx)  # Returns async generator

    return await func(args, ctx)  # Returns string
