'use client';

/**
 * ToolCallCard — the workshop's "paper slip" for one tool call.
 *
 * Visual contract (matches the workshop CSS vocabulary):
 *   ┌─[agent rail ────────────────────────────────────────────────┐
 *   │  [icon]  EDIT · src/foo.ts                       +12 −3  ⌃ │
 *   │  ┌─[diff body, when expanded]──────────────────────────┐   │
 *   │  └────────────────────────────────────────────────────┘   │
 *   └────────────────────────────────────────────────────────────┘
 *
 * The 2px left rail is coloured by the executing agent (passed in via
 * `agent` prop from ForkDiagram; defaults to the brand warm on the
 * main thread). All states (running/done/error) read through opacity
 * and animation on that single rail — no extra status borders or pills.
 *
 * Collapsing rules:
 *   - tools with diff content → auto-expanded
 *   - tools with text output  → collapsed by default, chevron toggles
 *   - tools with no content   → no chevron, header only
 *
 * Ghost-suppression (legacy bug fix preserved): if a tool reports
 * `completed` with no path, no output, no custom title, hide it
 * entirely — OpenCode occasionally emits these as side effects.
 */

import { useEffect, useState } from 'react';
import { ChevronRight, FilePlus, Loader2 } from 'lucide-react';
import type { CodeLabToolCall } from '@/stores/module-stores/codelab-store';
import { extractFilePath, getTool, shortPath } from '../shared/ToolMeta';
import { agentColor } from '../shared/AgentMeta';
import { UnifiedDiff } from './UnifiedDiff';
import { InlineDiff } from './InlineDiff';

interface ToolCallCardProps {
  toolCall: CodeLabToolCall;
  /** When rendered inside a parallel task, the executing agent's id.
      Used to colour the left rail. Defaults to undefined → warm. */
  agent?: string;
}

interface RenderPlan {
  title: string;
  badge: string | null;
  expandable: boolean;
  showFileDiff: boolean;
  showInlineDiff: boolean;
}

function planRender(toolCall: CodeLabToolCall): RenderPlan {
  const inp = toolCall.input as Record<string, unknown>;
  const t = toolCall.tool;
  const out = toolCall.output ?? '';
  const isRunning = toolCall.status === 'running';
  const fp = extractFilePath(inp);

  let title = toolCall.title || t;
  let badge: string | null = null;
  let expandable = false;
  let showFileDiff = false;
  let showInlineDiff = false;

  if (t === 'read') {
    title = shortPath(fp) || title;
    badge = isRunning ? null : `${out ? out.split('\n').length : 0} 行`;
  } else if (t === 'write') {
    title = shortPath(fp) || title;
    const content = (inp?.content as string) || out;
    const lines = content ? content.split('\n').length : 0;
    badge = isRunning
      ? null
      : toolCall.isNewFile ? `新建 · ${lines} 行` : `${lines} 行`;
  } else if (t === 'edit' || t === 'multiedit') {
    title = shortPath(fp) || title;
    if (toolCall.fileDiff && toolCall.status === 'completed') {
      showFileDiff = true;
      badge = `+${toolCall.fileDiff.additions} −${toolCall.fileDiff.deletions}`;
    } else if (inp?.old_string || inp?.new_string) {
      showInlineDiff = true;
    }
  } else if (t === 'glob') {
    title = String(inp?.pattern || title);
    const n = out ? out.split('\n').filter((l) => l.trim()).length : 0;
    badge = isRunning ? null : `${n} 项`;
    expandable = !!out && n > 0;
  } else if (t === 'grep') {
    title = inp?.pattern ? `"${inp.pattern}"` : title;
    const n = out ? out.split('\n').filter((l) => l.trim()).length : 0;
    badge = isRunning ? null : `${n} 项`;
    expandable = !!out && n > 0;
  } else if (t === 'bash') {
    title = String(inp?.command || title);
    expandable = !!out;
  } else {
    expandable = !!out;
  }

  return { title, badge, expandable, showFileDiff, showInlineDiff };
}

export function ToolCallCard({ toolCall, agent }: ToolCallCardProps) {
  const meta = getTool(toolCall.tool);
  const Icon = toolCall.isNewFile ? FilePlus : meta.icon;
  const isRunning = toolCall.status === 'running';
  const isError = toolCall.status === 'error';
  const inp = toolCall.input as Record<string, unknown>;
  const fp = extractFilePath(inp);

  const plan = planRender(toolCall);

  // Auto-expand when diff arrives mid-stream (started running, then
  // landed with a diff payload). The user shouldn't have to click.
  const [expanded, setExpanded] = useState(plan.showFileDiff);
  useEffect(() => {
    if (plan.showFileDiff) setExpanded(true);
  }, [plan.showFileDiff]);

  // Ghost suppression — see header comment.
  const hasContent = fp || toolCall.output || (toolCall.title && toolCall.title !== toolCall.tool);
  if (!isRunning && !hasContent) return null;

  const canToggle = plan.expandable || plan.showFileDiff || plan.showInlineDiff;
  const rail = agent ? agentColor(agent) : 'var(--color-warm)';

  return (
    <div
      className={`tool-paper paper-rise my-1 ${isRunning ? 'is-running' : ''} ${isError ? 'opacity-50' : ''}`}
      style={{ ['--tool-rail' as never]: rail } as React.CSSProperties}
    >
      {/* Header row */}
      <div
        className={`flex items-center gap-2.5 py-0.5 ${canToggle ? 'cursor-pointer' : ''}`}
        onClick={canToggle ? () => setExpanded((v) => !v) : undefined}
      >
        {isRunning ? (
          <Loader2
            className="h-3.5 w-3.5 shrink-0 animate-spin"
            style={{ color: rail, opacity: 0.75 }}
          />
        ) : (
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/35" />
        )}

        <span className="atelier-eyebrow-sm shrink-0">{meta.eyebrow}</span>

        <span
          className="truncate text-[12px] tracking-tight text-foreground/70"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {toolCall.tool === 'bash' && (
            <span className="mr-1 text-warm/55" style={{ fontFamily: 'var(--font-mono)' }}>$</span>
          )}
          {plan.title}
        </span>

        {plan.badge && (
          <span
            className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/45"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {plan.badge}
          </span>
        )}

        {canToggle && (
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-muted-foreground/25 transition-transform duration-200 ${
              expanded ? 'rotate-90' : ''
            } ${!plan.badge ? 'ml-auto' : ''}`}
          />
        )}
      </div>

      {/* Diff body — unified takes priority over inline */}
      {plan.showFileDiff && toolCall.fileDiff && expanded && (
        <UnifiedDiff fileDiff={toolCall.fileDiff} />
      )}

      {plan.showInlineDiff && !plan.showFileDiff && toolCall.status === 'completed' && (
        <InlineDiff
          oldStr={inp?.old_string as string | undefined}
          newStr={inp?.new_string as string | undefined}
        />
      )}

      {/* Plain text output (grep/glob/bash) */}
      {plan.expandable && expanded && toolCall.output && (
        <pre
          className="mt-1 rounded-md px-3 py-2 text-[10.5px] leading-[1.7] text-muted-foreground/60 max-h-36 overflow-y-auto whitespace-pre-wrap"
          style={{
            fontFamily: 'var(--font-mono)',
            background: 'color-mix(in oklab, var(--color-foreground) 3%, transparent)',
            boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--color-border) 30%, transparent)',
          }}
        >
          {toolCall.output.slice(0, 2000)}
          {toolCall.output.length > 2000 && '\n…'}
        </pre>
      )}
    </div>
  );
}
