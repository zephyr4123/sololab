"""PDFExporter — render WriterAI documents to PDF via Playwright + headless Chromium.

The goal is "what you preview is what you export". We assemble a self-contained
HTML page that mirrors the in-app document preview (KaTeX math, HTML tables,
inline figures embedded as base64 data URIs) and let Chromium's print engine
produce the PDF. This guarantees pixel-level parity with the on-screen preview.
"""
from __future__ import annotations

import base64
import logging
from pathlib import Path

from playwright.async_api import async_playwright

from sololab.modules.writer.export.citation_formatter import format_reference

logger = logging.getLogger(__name__)


class PDFExporter:
    """Render a WriterAI document dict to PDF bytes."""

    def __init__(self, storage_path: str = "./storage") -> None:
        self.storage_path = Path(storage_path)

    async def export(self, doc: dict, citation_style: str = "nature-numeric") -> bytes:
        html = self._build_html(doc, citation_style)
        return await self._render_pdf(html)

    # ── HTML assembly ───────────────────────────────────────
    def _build_html(self, doc: dict, citation_style: str) -> str:
        title = doc.get("title", "Untitled Paper")
        sections = doc.get("sections", [])
        figures = doc.get("figures", [])
        references = doc.get("references", [])

        sections_html: list[str] = []
        for sec in sections:
            sec_title = _escape(sec.get("title", ""))
            sec_id = sec.get("id", "")
            sec_content = self._inline_figure_images(sec.get("content", "") or "")
            sections_html.append(f'<section><h2>{sec_title}</h2>{sec_content}</section>')

        # Document-level (global) figures — those without a section_id
        for fig in figures:
            if not fig.get("section_id"):
                fig_html = self._figure_html(fig)
                if fig_html:
                    sections_html.append(fig_html)

        refs_html = ""
        if references:
            heading = "参考文献" if _has_cjk(title) else "References"
            items: list[str] = []
            for ref in references:
                num = ref.get("number", "?")
                formatted = _escape(format_reference(ref, citation_style))
                items.append(
                    f'<li><span class="ref-num">[{num}]</span> {formatted}</li>'
                )
            refs_html = (
                f'<section class="references"><h2>{heading}</h2>'
                f'<ol>{"".join(items)}</ol></section>'
            )

        return f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>{_escape(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" crossorigin="anonymous"
  onload="renderMathInElement(document.body, {{
    delimiters: [
      {{left: '$$', right: '$$', display: true}},
      {{left: '\\\\[', right: '\\\\]', display: true}},
      {{left: '$', right: '$', display: false}},
      {{left: '\\\\(', right: '\\\\)', display: false}}
    ],
    throwOnError: false,
    ignoredClasses: ['ref-num']
  }}); window.__katex_done = true;"></script>
<style>
@page {{
  size: A4;
  margin: 2.2cm 2cm;
}}
* {{ box-sizing: border-box; }}
html, body {{
  font-family: 'Times New Roman', 'Songti SC', 'SimSun', '宋体', serif;
  font-size: 11.5pt;
  line-height: 1.75;
  color: #1a1a1a;
  background: #ffffff;
  margin: 0;
  padding: 0;
}}
h1.doc-title {{
  font-size: 22pt;
  text-align: center;
  font-weight: bold;
  margin: 0 0 0.4em;
  letter-spacing: 0.01em;
}}
.doc-divider {{
  width: 60px;
  height: 1px;
  background: #999;
  margin: 0.8em auto 2em;
}}
section h2 {{
  font-size: 14.5pt;
  font-weight: bold;
  border-bottom: 1.5px solid #333;
  padding-bottom: 0.3em;
  margin: 1.6em 0 0.8em;
  page-break-after: avoid;
}}
section {{
  page-break-inside: auto;
}}
p {{
  text-align: justify;
  margin: 0.4em 0 0.8em;
  text-indent: 2em;
  orphans: 3;
  widows: 3;
}}
ul, ol {{
  margin: 0.5em 0 0.9em 1em;
  padding-left: 1.5em;
}}
li {{ margin-bottom: 0.3em; }}
strong {{ font-weight: bold; }}
em {{ font-style: italic; }}

table {{
  width: 100%;
  border-collapse: collapse;
  margin: 1.2em 0;
  font-size: 10.5pt;
  page-break-inside: avoid;
  font-family: 'Helvetica', 'Arial', sans-serif;
}}
thead {{
  background: #f0f0f0;
  font-weight: bold;
}}
th, td {{
  border: 1px solid #999;
  padding: 0.5em 0.7em;
  text-align: left;
  vertical-align: top;
}}

figure {{
  text-align: center;
  margin: 1.5em auto;
  page-break-inside: avoid;
  max-width: 100%;
}}
figure img {{
  max-width: 95%;
  max-height: 18cm;
  height: auto;
}}
figcaption {{
  font-size: 10pt;
  color: #555;
  margin-top: 0.6em;
  font-style: italic;
  line-height: 1.5;
  text-indent: 0;
}}

.references {{
  margin-top: 2.5em;
  page-break-before: auto;
}}
.references h2 {{
  border-bottom: 1.5px solid #333;
}}
.references ol {{
  list-style: none;
  padding-left: 0;
  margin: 0;
}}
.references li {{
  font-size: 10pt;
  margin-bottom: 0.55em;
  padding-left: 2.6em;
  text-indent: -2.6em;
  text-align: left;
  line-height: 1.5;
}}
.ref-num {{
  font-weight: bold;
  color: #333;
  margin-right: 0.4em;
}}

.katex-display {{
  margin: 1em 0;
  text-align: center;
  overflow-x: auto;
}}
.katex {{ font-size: 1.05em; }}
</style>
</head>
<body>
<h1 class="doc-title">{_escape(title)}</h1>
<div class="doc-divider"></div>
{"".join(sections_html)}
{refs_html}
</body>
</html>"""

    def _inline_figure_images(self, html: str) -> str:
        """Replace `<img src="/storage/...">` with base64 data URIs.

        Inline data URIs avoid any need for the headless browser to fetch the
        backend over the network during PDF rendering.
        """
        import re

        def replace_src(match: "re.Match[str]") -> str:
            attrs_pre, src, attrs_post = match.group(1), match.group(2), match.group(3)
            data_uri = self._image_to_data_uri(src)
            return f"<img{attrs_pre}src=\"{data_uri or src}\"{attrs_post}"

        return re.sub(
            r'<img([^>]*?)src="(/storage/[^"]+)"([^>]*?)',
            replace_src,
            html,
        )

    def _image_to_data_uri(self, url: str) -> str | None:
        path = self._resolve_figure_path(url)
        if not path or not path.exists():
            logger.warning("PDF export: figure missing on disk: %s (resolved=%s)", url, path)
            return None
        ext = path.suffix.lstrip(".").lower()
        mime = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "gif": "image/gif",
            "svg": "image/svg+xml",
            "webp": "image/webp",
        }.get(ext, "image/png")
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        return f"data:{mime};base64,{data}"

    def _figure_html(self, fig: dict) -> str | None:
        url = fig.get("url", "") or ""
        caption = fig.get("caption", "") or ""
        path = self._resolve_figure_path(url)
        if path is None or not path.exists():
            logger.warning("PDF export: figure missing: %s", url)
            return None
        data_uri = self._image_to_data_uri(url) or url
        order = fig.get("order", "?")
        return (
            "<figure>"
            f'<img src="{data_uri}" alt="{_escape(caption[:120])}"/>'
            f"<figcaption><strong>图 {order}.</strong> {_escape(caption)}</figcaption>"
            "</figure>"
        )

    def _resolve_figure_path(self, url: str) -> Path | None:
        if not url:
            return None
        if url.startswith(("http://", "https://", "data:")):
            return None
        if url.startswith("/storage/"):
            return self.storage_path / url[len("/storage/"):]
        if url.startswith("/"):
            return Path(url)
        return self.storage_path / "figures" / url

    # ── Playwright render ───────────────────────────────────
    async def _render_pdf(self, html: str) -> bytes:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                args=["--no-sandbox", "--disable-dev-shm-usage"]
            )
            try:
                context = await browser.new_context()
                page = await context.new_page()
                # `domcontentloaded` is enough since KaTeX flips `__katex_done`
                # via the auto-render onload callback. We then wait for that flag
                # explicitly so the PDF capture is taken AFTER math has rendered.
                await page.set_content(html, wait_until="domcontentloaded", timeout=30000)
                try:
                    await page.wait_for_function(
                        "window.__katex_done === true", timeout=15000
                    )
                except Exception:  # noqa: BLE001
                    logger.warning("KaTeX render flag not set within 15s; PDF may miss math")
                # Small extra settle for fonts/images
                await page.wait_for_timeout(300)
                pdf_bytes = await page.pdf(
                    format="A4",
                    print_background=True,
                    margin={
                        "top": "2.2cm",
                        "bottom": "2.2cm",
                        "left": "2cm",
                        "right": "2cm",
                    },
                    prefer_css_page_size=True,
                )
                return pdf_bytes
            finally:
                await browser.close()


def _has_cjk(text: str) -> bool:
    return any("\u4e00" <= c <= "\u9fff" for c in text)


def _escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
