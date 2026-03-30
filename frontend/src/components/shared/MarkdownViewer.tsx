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
          ? 'prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-base [&_h1]:my-2 [&_h2]:text-[0.9rem] [&_h2]:my-1.5 [&_h3]:text-[0.85rem] [&_h3]:my-1 [&_p]:my-1.5 [&_p]:leading-[1.7] [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_pre]:my-2.5 [&_pre]:text-xs [&_blockquote]:my-2 [&_hr]:my-3'
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
