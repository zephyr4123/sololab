"""PandocExporter — convert WriterAI documents to .docx via pandoc.

Pandoc handles LaTeX math (→ native Word OMML equations), HTML tables (→ real
multi-column Word tables), figures, lists, headings, etc. This is the academic
gold standard for HTML→DOCX conversion and replaces our hand-rolled HTML parser
plus pylatexenc Unicode-text approach.

Usage:
    exporter = PandocExporter(storage_path="./storage")
    docx_bytes = await exporter.export(doc, citation_style="nature-numeric")
"""
from __future__ import annotations

import asyncio
import logging
import shutil
import tempfile
from pathlib import Path

from sololab.modules.writer.export.citation_formatter import format_reference

logger = logging.getLogger(__name__)


class PandocNotInstalled(RuntimeError):
    """Raised when pandoc binary is missing from PATH."""


class PandocExporter:
    """Convert a WriterAI document dict to .docx bytes using pandoc."""

    def __init__(self, storage_path: str = "./storage") -> None:
        self.storage_path = Path(storage_path)
        if shutil.which("pandoc") is None:
            raise PandocNotInstalled("pandoc binary not found in PATH")

    async def export(self, doc: dict, citation_style: str = "nature-numeric") -> bytes:
        html = self._build_html(doc, citation_style)
        return await self._run_pandoc(html)

    # ── HTML assembly ───────────────────────────────────────
    def _build_html(self, doc: dict, citation_style: str) -> str:
        title = doc.get("title", "Untitled Paper")
        sections = doc.get("sections", [])
        figures = doc.get("figures", [])
        references = doc.get("references", [])

        parts: list[str] = []
        parts.append("<!DOCTYPE html><html><body>")
        parts.append(f"<h1>{_escape_text(title)}</h1>")

        for section in sections:
            sec_title = section.get("title", "")
            sec_id = section.get("id", "")
            sec_content = _clean_latex_escapes(section.get("content", ""))
            if sec_title:
                parts.append(f"<h2>{_escape_text(sec_title)}</h2>")
            if sec_content:
                parts.append(sec_content)
            for fig in figures:
                if fig.get("section_id") == sec_id:
                    fig_html = self._figure_html(fig)
                    if fig_html:
                        parts.append(fig_html)

        for fig in figures:
            if not fig.get("section_id"):
                fig_html = self._figure_html(fig)
                if fig_html:
                    parts.append(fig_html)

        if references:
            heading = "参考文献" if _has_cjk(title) else "References"
            parts.append(f"<h2>{heading}</h2>")
            parts.append("<ol>")
            for ref in references:
                formatted = _escape_text(format_reference(ref, citation_style))
                parts.append(f"<li>{formatted}</li>")
            parts.append("</ol>")

        parts.append("</body></html>")
        return "\n".join(parts)

    def _figure_html(self, fig: dict) -> str | None:
        url = fig.get("url", "") or ""
        caption = fig.get("caption", "") or ""
        path = self._resolve_figure_path(url)
        if path is None or not path.exists():
            logger.warning("Figure missing on disk: %s (resolved=%s)", url, path)
            return None
        # pandoc accepts both bare absolute paths and file:// URIs; bare path
        # avoids URL-encoding pitfalls with non-ASCII filenames
        return (
            "<figure>"
            f'<img src="{path}" alt="{_escape_text(caption[:80])}"/>'
            f"<figcaption>{_escape_text(caption)}</figcaption>"
            "</figure>"
        )

    def _resolve_figure_path(self, url: str) -> Path | None:
        if not url:
            return None
        if url.startswith(("http://", "https://")):
            return None
        if url.startswith("/storage/"):
            return self.storage_path / url[len("/storage/"):]
        if url.startswith("/"):
            return Path(url)
        return self.storage_path / "figures" / url

    # ── Pandoc subprocess ───────────────────────────────────
    async def _run_pandoc(self, html: str) -> bytes:
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp_out:
            docx_path = tmp_out.name
        try:
            proc = await asyncio.create_subprocess_exec(
                "pandoc",
                "-f",
                "html+tex_math_dollars+tex_math_double_backslash",
                "-t",
                "docx",
                "-o",
                docx_path,
                "--standalone",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate(input=html.encode("utf-8"))
            if proc.returncode != 0:
                raise RuntimeError(
                    f"pandoc failed (rc={proc.returncode}): {stderr.decode('utf-8', 'replace')[:500]}"
                )
            if stderr:
                logger.info("pandoc stderr: %s", stderr.decode("utf-8", "replace")[:500])
            return Path(docx_path).read_bytes()
        finally:
            try:
                Path(docx_path).unlink()
            except OSError:
                pass


def _has_cjk(text: str) -> bool:
    return any("\u4e00" <= c <= "\u9fff" for c in text)


def _escape_text(text: str) -> str:
    """HTML-escape plain text (titles, captions, refs). Section content is already HTML."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _clean_latex_escapes(html: str) -> str:
    """Strip LaTeX backslash-escapes that LLMs over-apply outside math contexts.

    Pandoc with `tex_math_dollars` correctly extracts `$...$` math; outside of
    that, sequences like `\\%` become literal text and need normalization.
    """
    return html.replace(r"\%", "%")
