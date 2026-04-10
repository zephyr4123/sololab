"""HTML 预览渲染器 — 为前端 DocumentPreview 提供模板感知的 HTML 输出。

根据模板生成不同 CSS 样式，处理引用格式化和图表位置。
"""
from __future__ import annotations

from sololab.modules.writer.export.citation_formatter import format_reference_list


def render_document_html(doc: dict, citation_style: str = "nature-numeric") -> str:
    """Render a full document as styled HTML.

    Args:
        doc: Full document dict from DocumentManager.
        citation_style: Citation formatting style.

    Returns:
        Complete HTML string with inline CSS.
    """
    template_id = doc.get("template_id", "nature")
    title = doc.get("title", "Untitled Paper")
    sections = doc.get("sections", [])
    references = doc.get("references", [])
    figures = doc.get("figures", [])

    css = _get_template_css(template_id)

    # Build figures lookup by section
    figs_by_section: dict[str, list] = {}
    for fig in figures:
        sid = fig.get("section_id", "__global__")
        figs_by_section.setdefault(sid, []).append(fig)

    html_parts = [
        f"<style>{css}</style>",
        '<div class="paper">',
        f'<h1 class="paper-title">{_escape(title)}</h1>',
    ]

    for section in sections:
        sec_id = section.get("id", "")
        sec_title = section.get("title", "")
        content = section.get("content", "")
        status = section.get("status", "empty")

        html_parts.append(f'<section class="paper-section" data-section-id="{sec_id}" data-status="{status}">')
        html_parts.append(f'<h2>{_escape(sec_title)}</h2>')

        if content:
            html_parts.append(f'<div class="section-content">{content}</div>')
        else:
            html_parts.append('<p class="placeholder">Waiting to be written...</p>')

        # Inline figures
        for fig in figs_by_section.get(sec_id, []):
            num = fig.get("order", fig.get("number", 0))
            html_parts.append(
                f'<figure class="paper-figure">'
                f'<img src="{_escape(fig.get("url", ""))}" alt="{_escape(fig.get("caption", ""))}" />'
                f'<figcaption>Figure {num}. {_escape(fig.get("caption", ""))}</figcaption>'
                f'</figure>'
            )

        html_parts.append('</section>')

    # References
    if references:
        html_parts.append('<section class="paper-section references">')
        html_parts.append('<h2>References</h2>')
        html_parts.append('<ol class="reference-list">')
        for ref in references:
            formatted = format_reference(ref, citation_style)
            html_parts.append(f'<li value="{ref.get("number", 0)}">{formatted}</li>')
        html_parts.append('</ol>')
        html_parts.append('</section>')

    # Global figures
    for fig in figs_by_section.get("__global__", []):
        num = fig.get("order", fig.get("number", 0))
        html_parts.append(
            f'<figure class="paper-figure">'
            f'<img src="{_escape(fig.get("url", ""))}" alt="{_escape(fig.get("caption", ""))}" />'
            f'<figcaption>Figure {num}. {_escape(fig.get("caption", ""))}</figcaption>'
            f'</figure>'
        )

    html_parts.append('</div>')

    return "\n".join(html_parts)


def _escape(text: str) -> str:
    """Basic HTML escaping."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def format_reference(ref: dict, style: str) -> str:
    """Format a single reference (re-export from citation_formatter)."""
    from sololab.modules.writer.export.citation_formatter import format_reference as _fmt
    return _fmt(ref, style)


def _get_template_css(template_id: str) -> str:
    """Return template-specific CSS for preview rendering."""
    base_css = """
    .paper { max-width: 800px; margin: 0 auto; font-family: 'Times New Roman', serif; line-height: 1.6; color: #1a1a1a; }
    .paper-title { text-align: center; font-size: 1.5em; margin-bottom: 1em; }
    .paper-section { margin-bottom: 1.5em; }
    .paper-section h2 { font-size: 1.15em; margin-bottom: 0.5em; border-bottom: 1px solid #ddd; padding-bottom: 0.2em; }
    .section-content { text-align: justify; }
    .section-content p { margin-bottom: 0.5em; }
    .placeholder { color: #999; font-style: italic; }
    .paper-figure { text-align: center; margin: 1em 0; }
    .paper-figure img { max-width: 100%; }
    .paper-figure figcaption { font-size: 0.85em; color: #555; margin-top: 0.3em; }
    .reference-list { font-size: 0.9em; padding-left: 2em; }
    .reference-list li { margin-bottom: 0.3em; }
    """

    template_overrides = {
        "cvpr": ".paper { max-width: 700px; column-count: 2; column-gap: 1.5em; font-size: 0.9em; } .paper-title { column-span: all; }",
        "iccv": ".paper { max-width: 700px; column-count: 2; column-gap: 1.5em; font-size: 0.9em; } .paper-title { column-span: all; }",
        "acm": ".paper { max-width: 700px; column-count: 2; column-gap: 1.2em; font-size: 0.9em; } .paper-title { column-span: all; }",
        "chinese_journal": ".paper { font-family: 'SimSun', 'Songti SC', serif; } .section-content p { text-indent: 2em; }",
    }

    return base_css + template_overrides.get(template_id, "")
