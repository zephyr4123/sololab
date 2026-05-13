'use client';

/**
 * StreamingMarkdown — agent output rendered as inline prose with a warm
 * blinking caret at the tail. No surrounding box, no border. The text is
 * what the user reads; the caret is the only chrome.
 *
 * Backend control tokens (DSML) leak through `agent_content_delta` while
 * the OutputParser only strips them from the *final* content. We strip
 * them here so the user never sees `[msg_type: synthesis]` etc. mid-flow.
 */

import { useMemo } from 'react';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

interface StreamingMarkdownProps {
  content: string;
  live?: boolean;
  compact?: boolean;
}

// DSML control fragments that the LLM uses to demarcate message types
// and that the agent layer strips from the parsed Message — but they
// still appear in the raw streaming deltas.
const DSML_PATTERNS: RegExp[] = [
  /\[msg_type:\s*\w+\]/gi,
  /<\|DSML\|[^>]*>/g,
  /<DSML[^>]*>/g,
  /<\/DSML>/g,
];

function stripControlTokens(raw: string): string {
  let out = raw;
  for (const re of DSML_PATTERNS) out = out.replace(re, '');
  // Collapse runs of blank lines that the stripped tokens left behind.
  return out.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n').trimStart();
}

export function StreamingMarkdown({ content, live = true, compact = true }: StreamingMarkdownProps) {
  const cleaned = useMemo(() => stripControlTokens(content), [content]);
  if (!cleaned) return null;
  return (
    <div className="relative text-foreground/85 leading-[1.72]">
      <MarkdownViewer content={cleaned} compact={compact} />
      {live && <span className="streaming-caret" aria-hidden />}
    </div>
  );
}
