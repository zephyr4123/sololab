'use client';

/**
 * AgentLane — one persona's column inside an Act.
 *
 * Hairless surface: header (AgentSigil) sits on top, tool rows stack
 * beneath, then the streaming markdown is the body. No outer border —
 * lanes are separated by spacing + a soft vertical fade rule
 * (.soft-divider-v) the parent grid renders between them.
 *
 * The lane has 4 visual states:
 *   - waiting (no events yet)
 *   - thinking (only tool calls inflight)
 *   - streaming (delta tokens flowing)
 *   - done (final content present, no caret)
 */

import { useMemo } from 'react';
import { AgentSigil, type SigilState } from '../../shared/AgentSigil';
import { ToolRow, deriveToolRows } from '../../shared/ToolRow';
import { StreamingMarkdown } from '../../shared/StreamingMarkdown';

interface AgentLaneProps {
  agent: string;
  events: Array<{ type: string; [key: string]: any }>;
  /** Filter events to those produced by this agent (default true). */
  scoped?: boolean;
  /** Override which final-content action to display (defaults: synthesis | critique | idea). */
  finalActions?: string[];
}

export function AgentLane({
  agent,
  events,
  scoped = true,
  finalActions = ['synthesis', 'critique', 'idea'],
}: AgentLaneProps) {
  const matches = (e: any) => !scoped || !e.agent || e.agent === agent;

  const streamingContent = useMemo(
    () =>
      events
        .filter((e) => e.type === 'agent_content_delta' && matches(e))
        .map((e) => e.delta || '')
        .join(''),
    [events, agent, scoped],
  );

  const finalContent = useMemo(() => {
    // Priority 1: explicit `agent` event with a synthesis/critique action.
    const fromAgent = events.find(
      (e) =>
        e.type === 'agent' &&
        finalActions.includes(e.action) &&
        matches(e) &&
        typeof e.content === 'string' &&
        e.content.length > 30,
    );
    if (fromAgent) return (fromAgent as any).content as string;

    // Priority 2: an `idea` event addressed to this agent.  The backend
    // emits `type: 'idea'` (a top-level event type) rather than `type:
    // 'agent', action: 'idea'`, so the lane needs to read it directly to
    // drop the streaming caret once the parsed message lands.
    if (finalActions.includes('idea')) {
      const idea = events.find(
        (e) =>
          e.type === 'idea' &&
          (!scoped || (e as any).author === agent) &&
          typeof (e as any).content === 'string' &&
          (e as any).content.length > 30,
      );
      if (idea) return (idea as any).content as string;
    }

    return '';
  }, [events, agent, scoped, finalActions]);

  const toolRows = useMemo(() => deriveToolRows(events, scoped ? agent : undefined), [events, agent, scoped]);

  const hasDone = events.some(
    (e) => e.type === 'agent' && e.action === 'done' && matches(e),
  );
  const hasEmpty = events.some(
    (e) => e.type === 'agent' && e.action === 'empty' && matches(e),
  );
  const hasError = events.some(
    (e) => e.type === 'agent' && e.action === 'error' && matches(e),
  );

  let state: SigilState = 'idle';
  if (streamingContent && !finalContent) state = 'streaming';
  else if (toolRows.some((t) => t.inflight) || (events.length > 0 && !finalContent && !hasDone)) state = 'thinking';
  else if (finalContent || hasDone) state = 'done';

  const showStreaming = streamingContent && !finalContent;

  return (
    <div className="flex min-w-0 flex-col gap-2.5 py-1">
      <AgentSigil agent={agent} state={state} />

      {toolRows.length > 0 && (
        <div className="flex flex-col gap-px pl-[30px]">
          {toolRows.map((t, i) => (
            <ToolRow key={i} tool={t} />
          ))}
        </div>
      )}

      {showStreaming && (
        <div className="pl-[30px] text-[12.5px]">
          <StreamingMarkdown content={streamingContent} live compact />
        </div>
      )}

      {finalContent && (
        <div className="pl-[30px] text-[12.5px]">
          <StreamingMarkdown content={finalContent} live={false} compact />
        </div>
      )}

      {hasEmpty && !finalContent && !showStreaming && (
        <p className="pl-[30px] text-[11px] text-muted-foreground/45 italic">
          没有产出有效内容
        </p>
      )}
      {hasError && (
        <p className="pl-[30px] text-[11px] text-destructive/75 italic">
          运行错误
        </p>
      )}

      {!toolRows.length && !showStreaming && !finalContent && !hasEmpty && !hasError && (
        <p className="pl-[30px] text-[11px] text-muted-foreground/35 italic">
          待启动…
        </p>
      )}
    </div>
  );
}
