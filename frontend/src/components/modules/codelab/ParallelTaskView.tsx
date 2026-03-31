'use client';

import { useState, useEffect } from 'react';
import { Check, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import type { ParallelTaskGroup, ParallelTaskInfo, CodeLabToolCall } from '@/stores/module-stores/codelab-store';

/* ── Agent palette ── */

const PALETTE: Record<string, { color: string; label: string }> = {
  explore: { color: '#7CB3E0', label: 'Explorer' },
  general: { color: '#C9A87C', label: 'General' },
  plan:    { color: '#A78BFA', label: 'Planner' },
  build:   { color: '#6EE7A0', label: 'Builder' },
};
const FALLBACK = { color: '#A8A29E', label: 'Agent' };
function pal(agent: string) { return PALETTE[agent] ?? FALLBACK; }

/* ── Elapsed timer ── */

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

/* ── Format a tool call as a readable command string ──
   e.g. "read src/config.py" | "grep 'auth'" | "glob **∕*.ts" | "$ ls -la"
*/

function formatToolCmd(tc: CodeLabToolCall): string {
  const inp = tc.input as Record<string, any>;
  const tool = tc.tool;

  if (tool === 'bash') {
    const cmd = inp?.command || '';
    // Show first ~60 chars of the command
    return `$ ${typeof cmd === 'string' ? cmd.slice(0, 60) : cmd}`;
  }

  if (tool === 'read' || tool === 'write' || tool === 'edit') {
    const fp = inp?.file_path || inp?.filePath || inp?.path || '';
    return `${tool} ${shortPath(fp)}`;
  }

  if (tool === 'glob') {
    const pattern = inp?.pattern || inp?.path || '';
    return `glob ${pattern}`;
  }

  if (tool === 'grep') {
    const pattern = inp?.pattern || '';
    const path = inp?.path || inp?.file_path || '';
    const pathPart = path ? ` ${shortPath(path)}` : '';
    return `grep "${pattern}"${pathPart}`;
  }

  // Fallback: tool name + first string arg
  const firstArg = inp?.file_path || inp?.filePath || inp?.path || inp?.pattern || inp?.command || inp?.query || '';
  if (firstArg) return `${tool} ${typeof firstArg === 'string' ? firstArg.slice(0, 50) : firstArg}`;
  return tc.title || tool;
}

/** Shorten a file path to last 2-3 segments */
function shortPath(p: unknown): string {
  if (!p || typeof p !== 'string') return '';
  const segs = p.split('/').filter(Boolean);
  if (segs.length <= 3) return segs.join('/');
  return '…/' + segs.slice(-2).join('/');
}

/* ═══════════════════════════════════════════════════
   Branch — a single agent's row in the tree
   ═══════════════════════════════════════════════════ */

function Branch({ task, isLast, index }: { task: ParallelTaskInfo; isLast: boolean; index: number }) {
  const p = pal(task.agent);
  const elapsed = useElapsed(task.startTime, task.endTime);
  const isRunning = task.status === 'running';
  const isDone = task.status === 'completed';
  const isError = task.status === 'error' || task.status === 'timeout';

  // Get the latest meaningful tool call (skip pending/empty ones)
  const latestTool = [...task.toolCalls].reverse().find((tc) => {
    if (tc.status === 'pending') return false;
    const inp = tc.input as Record<string, any>;
    return !!(inp?.file_path || inp?.filePath || inp?.path || inp?.pattern || inp?.command || inp?.query);
  });

  const cmdText = latestTool ? formatToolCmd(latestTool) : null;
  const toolCount = task.toolCalls.filter((tc) => tc.status === 'completed').length;

  return (
    <div
      className="relative animate-fade-in-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Branch connector lines */}
      <div
        className="absolute left-[7px] top-0 w-px"
        style={{
          height: isLast ? '14px' : '100%',
          background: 'var(--color-warm)',
          opacity: 0.15,
        }}
      />
      <div
        className="absolute left-[7px] top-[14px] h-px"
        style={{ width: '14px', background: 'var(--color-warm)', opacity: 0.15 }}
      />

      {/* Branch content */}
      <div className="pl-7 py-[5px]">
        {/* Line 1: Agent header */}
        <div className="flex items-center gap-1.5">
          {/* Status dot */}
          <div className="relative flex-shrink-0">
            <div className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: p.color }} />
            {isRunning && (
              <div
                className="absolute inset-[-2px] rounded-full animate-ping"
                style={{ backgroundColor: p.color, opacity: 0.3 }}
              />
            )}
          </div>

          <span
            className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
            style={{ color: p.color }}
          >
            {p.label}
          </span>

          <span className="text-[10.5px] text-muted-foreground/50 truncate flex-1 min-w-0">
            {task.description}
          </span>

          {/* Timer + count */}
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/35 flex-shrink-0 tabular-nums font-mono">
            {isDone && <Check size={10} style={{ color: p.color }} />}
            {isError && <AlertTriangle size={10} className="text-destructive/60" />}
            {isRunning && <Clock size={9} className="opacity-50" />}
            {elapsed}
            {toolCount > 0 && (
              <span className="text-muted-foreground/20 ml-0.5">· {toolCount}</span>
            )}
          </span>
        </div>

        {/* Line 2: Latest tool call — live command log */}
        <div className="h-[18px] mt-[2px] overflow-hidden">
          {cmdText ? (
            <p
              key={latestTool?.id}
              className="font-mono text-[10.5px] text-muted-foreground/40 truncate animate-fade-in"
              style={isRunning && latestTool?.status === 'running' ? { color: p.color, opacity: 0.6 } : undefined}
            >
              {latestTool?.status === 'running' && (
                <Loader2 size={9} className="inline animate-spin mr-1 align-[-1px]" />
              )}
              {cmdText}
            </p>
          ) : isRunning ? (
            <p className="font-mono text-[10.5px] text-muted-foreground/25 italic animate-fade-in">
              <Loader2 size={9} className="inline animate-spin mr-1 align-[-1px]" style={{ color: p.color }} />
              starting…
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ParallelTaskView — tree fork visualization
   ═══════════════════════════════════════════════════ */

export function ParallelTaskView({ group }: { group: ParallelTaskGroup }) {
  const { tasks } = group;
  const running = tasks.filter((t) => t.status === 'running').length;
  const done = tasks.filter((t) => t.status !== 'running').length;
  const allDone = group.status === 'completed';

  return (
    <div className="my-2 select-none">
      {/* Fork header */}
      <div className="flex items-center gap-2 mb-1 pl-1">
        <div className="flex items-center gap-[6px] text-[10.5px] text-muted-foreground/45">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="opacity-60">
            <path d="M8 1v4M8 5L4 9M8 5l4 4M4 9v2a2 2 0 002 2h0M12 9v2a2 2 0 01-2 2h0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="font-medium tracking-wide">
            {running > 0
              ? `${tasks.length} agents · ${running} active`
              : `${tasks.length} agents · ${done} done`
            }
          </span>
        </div>
      </div>

      {/* Tree branches */}
      <div className="relative ml-1">
        {tasks.map((task, i) => (
          <Branch key={task.id} task={task} isLast={i === tasks.length - 1} index={i} />
        ))}
      </div>

      {/* Converge line */}
      {allDone && (
        <div className="flex items-center gap-2 mt-1 ml-1 animate-fade-in">
          <div className="w-[7px] h-px flex-shrink-0" style={{ background: 'var(--color-warm)', opacity: 0.15 }} />
          <div className="flex-1 h-px bg-border/30" />
          <span className="text-[9px] text-muted-foreground/25 italic pr-1">converged</span>
          <div className="flex-1 h-px bg-border/30" />
        </div>
      )}
    </div>
  );
}
