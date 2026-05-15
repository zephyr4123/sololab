'use client';

/**
 * ForkSpoke — a single agent's branch in the ForkDiagram.
 *
 * Three visual zones:
 *   - left rail anchor   (handled by ForkDiagram: shared vertical axis)
 *   - spoke + dot        (this component, anchored to that axis)
 *   - content column     (agent identity + live tool log + timer)
 *
 * State conveyed entirely through the dot:
 *   - running   → pulses (CSS spoke-pulse)
 *   - completed → solid filled
 *   - error     → solid with destructive halo
 *   - timeout   → solid with destructive halo + clock cue
 *
 * The "live tool log" row shows the latest meaningful tool call so the
 * user can see at a glance "Explorer is grepping for auth" rather than
 * a static "running" placeholder. After completion, this row collapses
 * into a one-line summary if one is present, or a tool count otherwise.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock, Loader2 } from 'lucide-react';
import type { CodeLabToolCall, ParallelTaskInfo } from '@/stores/module-stores/codelab-store';
import { getAgent } from '../shared/AgentMeta';
import { getTool, shortPath } from '../shared/ToolMeta';

interface ForkSpokeProps {
  task: ParallelTaskInfo;
  index: number;
}

function useElapsed(start: number, end?: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (end) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [end]);
  const s = ((end ?? now) - start) / 1000;
  return s < 60 ? `${Math.floor(s)}s` : `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
}

/** Pick the latest tool call that has real input (skip empty `pending` shells). */
function pickLatestTool(toolCalls: CodeLabToolCall[]): CodeLabToolCall | undefined {
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const tc = toolCalls[i];
    if (tc.status === 'pending') continue;
    const inp = tc.input as Record<string, unknown>;
    if (inp?.file_path || inp?.filePath || inp?.path || inp?.pattern || inp?.command || inp?.query) {
      return tc;
    }
  }
  return undefined;
}

function formatToolLine(tc: CodeLabToolCall): string {
  const inp = tc.input as Record<string, unknown>;
  const tool = tc.tool;
  if (tool === 'bash') {
    const cmd = String(inp?.command ?? '');
    return `$ ${cmd.slice(0, 60)}`;
  }
  if (tool === 'read' || tool === 'write' || tool === 'edit' || tool === 'multiedit') {
    return `${tool} ${shortPath(inp?.file_path || inp?.filePath || inp?.path)}`;
  }
  if (tool === 'glob') return `glob ${inp?.pattern ?? inp?.path ?? ''}`;
  if (tool === 'grep') {
    const path = inp?.path || inp?.file_path;
    return `grep "${inp?.pattern ?? ''}"${path ? ` ${shortPath(path)}` : ''}`;
  }
  const fallback = inp?.file_path || inp?.filePath || inp?.path || inp?.pattern || inp?.command || inp?.query;
  return fallback ? `${tool} ${String(fallback).slice(0, 50)}` : (tc.title || tool);
}

export function ForkSpoke({ task, index }: ForkSpokeProps) {
  const meta = getAgent(task.agent);
  const elapsed = useElapsed(task.startTime, task.endTime);
  const isRunning = task.status === 'running';
  const isDone = task.status === 'completed';
  const isError = task.status === 'error' || task.status === 'timeout';

  const latest = pickLatestTool(task.toolCalls);
  const completedCount = task.toolCalls.filter((tc) => tc.status === 'completed').length;
  const liveLine = latest ? formatToolLine(latest) : null;

  const railCSS = { ['--spoke-color' as never]: meta.color } as React.CSSProperties;

  // Slot height: the row that the spoke anchors to.
  const slotHeight = 56;
  const slotTop = 14 + index * slotHeight;
  const spokeY = slotTop + 14;

  return (
    <div className="fork-spoke relative" style={{ animationDelay: `${index * 80}ms` }}>
      {/* Stub + dot, absolutely positioned against the parent fork-axis */}
      <span
        aria-hidden
        className={`fork-spoke-stub ${isRunning ? 'is-running' : ''}`}
        style={{ ...railCSS, top: spokeY }}
      />
      <span
        aria-hidden
        className={`fork-spoke-dot ${isRunning ? 'is-running' : ''}`}
        style={{ ...railCSS, top: spokeY - 4 }}
      />

      {/* Content column — offset to clear the axis + spoke */}
      <div className="pl-9 pr-2 py-1.5 min-h-[56px]">
        {/* Identity row */}
        <div className="flex items-baseline gap-2">
          <span
            className="text-[16px] leading-none"
            style={{ fontFamily: 'var(--font-display)', color: meta.color, opacity: isRunning ? 0.95 : 0.75 }}
          >
            {meta.monogram}
          </span>
          <span
            className="text-[9.5px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: meta.color, opacity: 0.85 }}
          >
            {meta.caps}
          </span>
          <span className="truncate text-[11px] text-foreground/55 flex-1 min-w-0">
            {task.description}
          </span>
          <span
            className="shrink-0 flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground/45"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {isDone && <Check className="h-2.5 w-2.5" style={{ color: meta.color }} />}
            {isError && <AlertTriangle className="h-2.5 w-2.5 text-destructive/65" />}
            {isRunning && <Clock className="h-[9px] w-[9px] opacity-55" />}
            {elapsed}
            {completedCount > 0 && (
              <span className="text-muted-foreground/25">· {completedCount}</span>
            )}
          </span>
        </div>

        {/* Live tool log row */}
        <div className="mt-1 h-[16px] overflow-hidden">
          {liveLine ? (
            <p
              key={latest?.id}
              className="truncate text-[10.5px] text-muted-foreground/45 animate-fade-in"
              style={{
                fontFamily: 'var(--font-mono)',
                color: isRunning && latest?.status === 'running' ? meta.color : undefined,
                opacity: isRunning && latest?.status === 'running' ? 0.7 : undefined,
              }}
            >
              {latest?.status === 'running' && (
                <Loader2 className="inline h-[9px] w-[9px] mr-1 align-[-1px] animate-spin" />
              )}
              {liveLine}
            </p>
          ) : isRunning ? (
            <p
              className="text-[10.5px] italic text-muted-foreground/30 animate-fade-in"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <Loader2 className="inline h-[9px] w-[9px] mr-1 align-[-1px] animate-spin" style={{ color: meta.color }} />
              准备中…
            </p>
          ) : null}
        </div>

        {/* Summary line — appears once the spoke is done */}
        {isDone && task.summary && (
          <p className="mt-0.5 line-clamp-2 text-[10.5px] text-muted-foreground/55">
            {task.summary}
          </p>
        )}
      </div>
    </div>
  );
}
