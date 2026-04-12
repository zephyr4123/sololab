'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { WriterSection } from '@/stores/module-stores/writer-store';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface SectionRendererProps {
  section: WriterSection;
  isStreaming: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Render LaTeX math in an HTML string.
 * Supports: $$...$$ and \[...\] (display), $...$ and \(...\) (inline).
 */
function renderLatexInHTML(html: string): string {
  // Display math: $$...$$
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_m, tex) => {
    try { return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false }); }
    catch { return _m; }
  });
  // Display math: \[...\]
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, (_m, tex) => {
    try { return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false }); }
    catch { return _m; }
  });
  // Inline math: $...$ — skip currency like "$5 million" (digit-start + no LaTeX syntax)
  html = html.replace(/\$([^\$\n]{1,}?)\$/g, (_m, tex) => {
    const t = tex.trim();
    // Only skip if it starts with a digit AND has no LaTeX markers (\, ^, _, {, })
    if (/^\d/.test(t) && !/[\\^_{}]/.test(t)) return _m;
    try { return katex.renderToString(t, { displayMode: false, throwOnError: false }); }
    catch { return _m; }
  });
  // Inline math: \(...\)
  html = html.replace(/\\\((.*?)\\\)/g, (_m, tex) => {
    try { return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false }); }
    catch { return _m; }
  });
  return html;
}

export default function SectionRenderer({ section, isStreaming, isSelected, onSelect }: SectionRendererProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [section.content, isStreaming]);

  const renderedContent = useMemo(() => renderLatexInHTML(section.content), [section.content]);

  return (
    <div
      className={`group transition-all cursor-pointer rounded-sm ${
        isSelected ? 'ring-1 ring-warm/30 bg-warm/5' : 'hover:bg-accent/10'
      }`}
      onClick={onSelect}
    >
      {/* Section heading */}
      <div className="flex items-baseline justify-between mb-1.5 px-1">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground/80 font-serif">
          {section.title}
        </h2>
        <div className="flex items-center gap-2">
          {section.wordCount > 0 && (
            <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">{section.wordCount} 字</span>
          )}
          {isStreaming && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-warm animate-pulse" />
              <span className="text-[10px] text-warm/80">撰写中</span>
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {section.status === 'empty' ? (
        <div className="px-1 py-3 border-l-2 border-dashed border-border/30 ml-0.5">
          <p className="text-xs text-muted-foreground/40 italic font-serif">等待生成...</p>
        </div>
      ) : (
        <div
          ref={contentRef}
          className="px-1 text-[13px] leading-[1.7] text-foreground/85 font-serif max-h-[500px] overflow-y-auto
            [&_p]:mb-2 [&_p]:text-justify
            [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:mb-2 [&_ul_li]:mb-0.5
            [&_ol]:ml-4 [&_ol]:list-decimal [&_ol]:mb-2 [&_ol_li]:mb-0.5
            [&_strong]:font-semibold [&_em]:italic
            [&_table]:w-full [&_table]:border-collapse [&_table]:my-4 [&_table]:text-[12px] [&_table]:font-sans
            [&_thead]:bg-muted/40 [&_thead]:border-b-2 [&_thead]:border-border
            [&_th]:border [&_th]:border-border/50 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:font-semibold [&_th]:text-left [&_th]:text-foreground
            [&_td]:border [&_td]:border-border/50 [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top
            [&_tbody_tr:hover]:bg-muted/20
            [&_.katex-display]:my-3 [&_.katex-display]:text-center [&_.katex-display]:overflow-x-auto
            [&_.katex]:text-[0.95em]"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
      )}

      {/* Streaming cursor */}
      {isStreaming && section.content && (
        <span className="inline-block w-0.5 h-4 bg-warm animate-pulse ml-1 -mb-1" />
      )}
    </div>
  );
}
