"""execute_code tool — run Python code in Docker sandbox for figure generation."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sololab.modules.writer.tools import WriterToolContext

logger = logging.getLogger(__name__)


async def execute(args: dict, ctx: WriterToolContext) -> str:
    """Execute Python code in the sandbox to generate figures.

    Args (from LLM):
        code: Python source code (matplotlib/plotly/pandas).
        description: Brief description of what the code does.
    """
    code = args.get("code", "")
    description = args.get("description", "data visualization")

    if not code:
        return "Error: code is required."

    if not ctx.sandbox_executor:
        return "Error: Sandbox executor not available. Docker may not be running."

    ctx.emit({
        "type": "code_executing",
        "description": description,
        "language": "python",
    })

    result = await ctx.sandbox_executor.execute(code, ctx.doc_id)

    if not result.success:
        error_msg = result.error or "Unknown error"
        tb = result.traceback or ""
        ctx.emit({
            "type": "tool",
            "tool": "execute_code",
            "status": "error",
            "error": error_msg,
        })
        return (
            f"Code execution failed: {error_msg}\n"
            f"{'Traceback: ' + tb[:500] if tb else ''}\n"
            f"Please fix the code and try again."
        )

    ctx.emit({
        "type": "tool",
        "tool": "execute_code",
        "status": "complete",
        "figures": result.figure_urls,
    })

    if not result.figure_urls:
        return "Code executed successfully but no figures were generated. Make sure to save figures to /output/."

    figures_str = "\n".join(f"  - {url}" for url in result.figure_urls)
    return (
        f"Code executed successfully. Generated {len(result.figure_urls)} figure(s):\n"
        f"{figures_str}\n"
        f"Use insert_figure to add these to the document."
    )
