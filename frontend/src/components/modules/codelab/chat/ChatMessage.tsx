'use client';

/**
 * ChatMessage — renders one user or assistant message.
 *
 * Visual contract:
 *   User      → right-aligned, single-column. Avatar suppressed; a small
 *               warm rule on the left edge marks "this came from you".
 *   Assistant → left-aligned with monogram badge (current agent at send
 *               time) + interleaved parts (text / tool / parallel-tasks).
 *
 * Why no Bot icon: the AgentSigil-style monogram already carries the
 * "this is the assistant" signal; double-marking with a Lucide robot
 * head would read as legacy AI-chat UI. The monogram is the badge.
 *
 * Streaming caret: when this is the last assistant message and a stream
 * is in flight, append a single warm caret. ThinkingIndicator handles
 * the "no text yet" case; this caret only appears after first delta.
 */

import { MarkdownViewer } from '@/components/shared/MarkdownViewer';
import type { CodeLabMessage } from '@/stores/module-stores/codelab-store';
import { getAgent } from '../shared/AgentMeta';
import { ToolCallCard } from '../tools/ToolCallCard';
import { ForkDiagram } from '../fork/ForkDiagram';
import { ThinkingIndicator } from './ThinkingIndicator';

interface ChatMessageProps {
  msg: CodeLabMessage;
  isLast: boolean;
  isStreaming: boolean;
  agentStatus: 'idle' | 'thinking' | 'tool_call' | 'writing';
  currentAgent: string;
}

export function ChatMessage({
  msg, isLast, isStreaming, agentStatus, currentAgent,
}: ChatMessageProps) {
  if (msg.role === 'user') return <UserMessage content={msg.content} />;
  return (
    <AssistantMessage
      msg={msg}
      isLast={isLast}
      isStreaming={isStreaming}
      agentStatus={agentStatus}
      currentAgent={currentAgent}
    />
  );
}

/* ── User message ── */

function UserMessage({ content }: { content: string }) {
  return (
    <div className="group flex justify-end py-3 px-1 animate-fade-in-up">
      <div
        className="relative max-w-[78%] rounded-2xl bg-warm/10 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-foreground/85"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        <span
          aria-hidden
          className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-px"
          style={{ background: 'color-mix(in oklab, var(--color-warm) 35%, transparent)' }}
        />
        {content}
      </div>
    </div>
  );
}

/* ── Assistant message ── */

function AssistantMessage({
  msg, isLast, isStreaming, agentStatus, currentAgent,
}: Omit<ChatMessageProps, 'msg'> & { msg: CodeLabMessage }) {
  const meta = getAgent(currentAgent);
  const showThinking = isLast && isStreaming && agentStatus === 'thinking';
  const showCaret = isLast && isStreaming && agentStatus !== 'thinking';

  return (
    <div className="flex gap-3 py-3 pl-1 animate-fade-in-up">
      {/* Agent monogram badge — top-left of the message */}
      <div className="shrink-0 pt-0.5">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 25%, transparent)`,
          }}
        >
          <span
            className="text-[15px] leading-none"
            style={{ fontFamily: 'var(--font-display)', color: meta.color }}
          >
            {meta.monogram}
          </span>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        {showThinking && <ThinkingIndicator />}

        {/* Interleaved parts — text and tools in SSE order */}
        {msg.parts.map((part, i) =>
          part.kind === 'text' ? (
            <div
              key={`t${i}`}
              className="text-[13.5px] prose prose-sm max-w-none py-0.5"
            >
              <MarkdownViewer content={part.content} compact />
            </div>
          ) : part.kind === 'parallel-tasks' ? (
            <ForkDiagram key={`pt${i}`} group={part.group} />
          ) : (
            <ToolCallCard key={part.toolCall.id} toolCall={part.toolCall} />
          )
        )}

        {showCaret && (
          <span
            className="inline-block h-4 w-[2px] align-text-bottom rounded-full ml-0.5 animate-pulse"
            style={{ background: 'color-mix(in oklab, var(--color-warm) 70%, transparent)' }}
          />
        )}
      </div>
    </div>
  );
}
