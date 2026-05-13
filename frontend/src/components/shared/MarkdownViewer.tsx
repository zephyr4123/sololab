import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownViewerProps {
  content: string;
  /** Compact mode for use inside cards — tighter spacing, smaller text, no extra margins */
  compact?: boolean;
}

export const MarkdownViewer = memo(function MarkdownViewer({ content, compact = false }: MarkdownViewerProps) {
  return (
    <div
      className={
        compact
          ? 'prose prose-sm max-w-none ' +
            '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ' +
            // Heading demotion: h1/h2 become quiet caps eyebrow labels,
            // h3/h4 are body-weight with a touch more weight. This kills
            // the "outline shouting" effect from agents emitting ##/###.
            '[&_h1]:text-[10.5px] [&_h1]:font-semibold [&_h1]:uppercase [&_h1]:tracking-[0.18em] [&_h1]:text-warm/75 [&_h1]:mt-3 [&_h1]:mb-1 ' +
            '[&_h2]:text-[10px] [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-[0.16em] [&_h2]:text-muted-foreground/65 [&_h2]:mt-2.5 [&_h2]:mb-0.5 ' +
            '[&_h3]:text-[12px] [&_h3]:font-medium [&_h3]:text-foreground/75 [&_h3]:mt-2 [&_h3]:mb-0.5 ' +
            '[&_h4]:text-[12px] [&_h4]:font-medium [&_h4]:text-foreground/70 [&_h4]:mt-1.5 [&_h4]:mb-0 ' +
            '[&_p]:my-1.5 [&_p]:leading-[1.72] ' +
            '[&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 ' +
            '[&_pre]:my-2.5 [&_pre]:text-xs ' +
            '[&_blockquote]:my-2 [&_blockquote]:text-muted-foreground/75 ' +
            '[&_hr]:my-3 ' +
            '[&_table]:my-2 [&_th]:text-[11px] [&_td]:text-[11.5px]'
          : 'prose prose-sm max-w-none'
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
