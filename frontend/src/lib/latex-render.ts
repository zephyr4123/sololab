import katex from 'katex';
import 'katex/dist/katex.min.css';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replace LaTeX math in an HTML string with KaTeX-rendered HTML.
 * Supports: $$...$$ and \[...\] (display), $...$ and \(...\) (inline).
 * Skips `$5 million`-style currency (digit-starts + no LaTeX markers).
 */
export function renderLatexInHTML(html: string): string {
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_m, tex) => {
    try { return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false }); }
    catch { return _m; }
  });
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, (_m, tex) => {
    try { return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false }); }
    catch { return _m; }
  });
  html = html.replace(/\$([^\$\n]{1,}?)\$/g, (_m, tex) => {
    const t = tex.trim();
    if (/^\d/.test(t) && !/[\\^_{}]/.test(t)) return _m;
    try { return katex.renderToString(t, { displayMode: false, throwOnError: false }); }
    catch { return _m; }
  });
  html = html.replace(/\\\((.*?)\\\)/g, (_m, tex) => {
    try { return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false }); }
    catch { return _m; }
  });
  return html;
}

/** Render LaTeX in a plain text string (HTML-escapes surrounding text first for XSS safety). */
export function renderLatexInText(text: string): string {
  return renderLatexInHTML(escapeHtml(text));
}
