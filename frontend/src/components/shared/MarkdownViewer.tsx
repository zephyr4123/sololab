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

export function MarkdownViewer({ content, compact = false }: MarkdownViewerProps) {
  return (
    <div
      className={
        compact
          ? 'prose prose-xs dark:prose-invert max-w-none text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-sm [&_h1]:font-bold [&_h1]:my-1.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:my-1 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:my-1 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:my-1.5 [&_pre]:text-xs [&_blockquote]:my-1.5 [&_hr]:my-2'
          : 'prose prose-sm dark:prose-invert max-w-none'
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
}
