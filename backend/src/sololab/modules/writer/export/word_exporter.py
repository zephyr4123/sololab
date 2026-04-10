"""WordExporter — 将 WriterAI 文档导出为 .docx Word 文件。

基于 python-docx，支持：
- 模板样式加载（.docx 模板文件）
- HTML 章节内容 → Word 段落映射
- 图表嵌入（URL 下载 + Caption + 编号）
- 参考文献列表（按模板引用格式）
"""
from __future__ import annotations

import io
import logging
import os
import re
from html.parser import HTMLParser
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt
from docx.oxml.ns import qn

from sololab.modules.writer.export.citation_formatter import format_reference

logger = logging.getLogger(__name__)

# 模板 docx 目录
TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "docx"


class WordExporter:
    """Export a WriterAI document to .docx format."""

    def __init__(self, storage_path: str = "./storage") -> None:
        self.storage_path = Path(storage_path)

    async def export(self, doc: dict, citation_style: str = "nature-numeric") -> bytes:
        """Export document to Word bytes.

        Args:
            doc: Full document dict from DocumentManager.
            citation_style: Citation formatting style.

        Returns:
            Word document as bytes (ready for HTTP response).
        """
        template_id = doc.get("template_id", "nature")
        template_path = TEMPLATES_DIR / f"{template_id}.docx"

        # Load template or create blank
        if template_path.exists():
            document = Document(str(template_path))
        else:
            document = Document()
            _setup_default_styles(document)

        # Title
        title = doc.get("title", "Untitled Paper")
        p = document.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(title)
        run.bold = True
        run.font.size = Pt(16)

        document.add_paragraph()  # spacing

        # Sections
        for section in doc.get("sections", []):
            self._add_section(document, section, doc)

        # Figures not inline (global)
        for fig in doc.get("figures", []):
            if not fig.get("section_id"):
                self._add_figure(document, fig)

        # References
        refs = doc.get("references", [])
        if refs:
            document.add_paragraph()
            document.add_heading("References", level=1)
            for ref in refs:
                formatted = format_reference(ref, citation_style)
                p = document.add_paragraph(f"[{ref.get('number', '')}] {formatted}")
                p.paragraph_format.first_line_indent = Pt(-18)
                p.paragraph_format.left_indent = Pt(18)
                p.style = document.styles["Normal"]
                for run in p.runs:
                    run.font.size = Pt(9)

        # Serialize to bytes
        buffer = io.BytesIO()
        document.save(buffer)
        buffer.seek(0)
        return buffer.getvalue()

    def _add_section(self, document: Document, section: dict, doc: dict) -> None:
        """Add a section (heading + content) to the document."""
        title = section.get("title", "")
        content = section.get("content", "")
        section_id = section.get("id", "")

        # Heading
        if title:
            document.add_heading(title, level=1)

        # Parse HTML content to paragraphs
        if content:
            parser = _HTMLToDocxParser(document)
            parser.feed(content)

        # Inline figures for this section
        for fig in doc.get("figures", []):
            if fig.get("section_id") == section_id:
                self._add_figure(document, fig)

    def _add_figure(self, document: Document, fig: dict) -> None:
        """Add a figure with caption to the document."""
        url = fig.get("url", "")
        caption = fig.get("caption", "")
        number = fig.get("order", fig.get("number", 0))

        # Try to load image from local storage
        img_path = self._resolve_figure_path(url)
        if img_path and os.path.exists(img_path):
            try:
                p = document.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run()
                run.add_picture(img_path, width=Inches(5.0))
            except Exception:
                logger.warning("Failed to embed figure: %s", img_path)
                document.add_paragraph(f"[Figure {number}: image not available]")
        else:
            document.add_paragraph(f"[Figure {number}: {url}]")

        # Caption
        if caption:
            cap_p = document.add_paragraph()
            cap_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = cap_p.add_run(f"Figure {number}. {caption}")
            run.italic = True
            run.font.size = Pt(9)

    def _resolve_figure_path(self, url: str) -> str | None:
        """Resolve a figure URL to a local file path."""
        if not url:
            return None
        # /storage/writer/{doc_id}/figures/{filename}
        if url.startswith("/storage/"):
            return str(self.storage_path / url.lstrip("/storage/"))
        # Absolute path
        if os.path.isabs(url):
            return url
        return None


def _setup_default_styles(document: Document) -> None:
    """Set up basic styles for a blank document."""
    style = document.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(11)
    style.paragraph_format.space_after = Pt(6)
    style.paragraph_format.line_spacing = 1.15


class _HTMLToDocxParser(HTMLParser):
    """Simple HTML → python-docx paragraph converter.

    Handles: <p>, <strong>/<b>, <em>/<i>, <ul>/<ol>/<li>, <br>, plain text.
    Complex HTML (tables, nested divs) falls back to plain text extraction.
    """

    def __init__(self, document: Document) -> None:
        super().__init__()
        self.document = document
        self._current_paragraph = None
        self._bold = False
        self._italic = False
        self._in_list = False
        self._list_ordered = False
        self._list_counter = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        tag = tag.lower()
        if tag in ("p", "div"):
            self._current_paragraph = self.document.add_paragraph()
        elif tag in ("strong", "b"):
            self._bold = True
        elif tag in ("em", "i"):
            self._italic = True
        elif tag == "br":
            if self._current_paragraph:
                self._current_paragraph.add_run("\n")
        elif tag == "ul":
            self._in_list = True
            self._list_ordered = False
        elif tag == "ol":
            self._in_list = True
            self._list_ordered = True
            self._list_counter = 0
        elif tag == "li":
            self._list_counter += 1
            prefix = f"{self._list_counter}. " if self._list_ordered else "• "
            self._current_paragraph = self.document.add_paragraph(prefix)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in ("strong", "b"):
            self._bold = False
        elif tag in ("em", "i"):
            self._italic = False
        elif tag in ("ul", "ol"):
            self._in_list = False
            self._list_counter = 0
        elif tag in ("p", "div", "li"):
            self._current_paragraph = None

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if not text:
            return
        if self._current_paragraph is None:
            self._current_paragraph = self.document.add_paragraph()
        run = self._current_paragraph.add_run(text)
        run.bold = self._bold
        run.italic = self._italic
        run.font.size = Pt(11)
