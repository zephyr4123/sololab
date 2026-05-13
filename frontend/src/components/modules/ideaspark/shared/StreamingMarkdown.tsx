'use client';

/**
 * StreamingMarkdown — agent output rendered as inline prose with a warm
 * blinking caret at the tail. No surrounding box, no border. The text is
 * what the user reads; the caret is the only chrome.
 *
 * For `done` state (no more tokens incoming), `live=false` removes the
 * caret without remounting the markdown subtree.
 */

import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

interface StreamingMarkdownProps {
  content: string;
  live?: boolean;
  compact?: boolean;
}

export function StreamingMarkdown({ content, live = true, compact = true }: StreamingMarkdownProps) {
  if (!content) {
    return null;
  }
  return (
    <div className="relative text-foreground/85 leading-[1.72]">
      <MarkdownViewer content={content} compact={compact} />
      {live && <span className="streaming-caret" aria-hidden />}
    </div>
  );
}
