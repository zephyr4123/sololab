'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Check, AlertTriangle, Clock, Loader2,
  Eye, Pencil, FileText, FolderSearch, Search, Terminal, Globe, Brain,
  ChevronDown,
} from 'lucide-react';
import type { ParallelTaskGroup, ParallelTaskInfo, CodeLabToolCall } from '@/stores/module-stores/codelab-store';

/* ═══════════════════════════════════════════════════
   Agent palette
   ═══════════════════════════════════════════════════ */

const PALETTE: Record<string, { color: string; label: string }> = {
  explore:  { color: '#7CB3E0', label: 'Explorer' },
  general:  { color: '#C9A87C', label: 'General' },
  plan:     { color: '#A78BFA', label: 'Planner' },
  build:    { color: '#6EE7A0', label: 'Builder' },
};
const FALLBACK = { color: '#A8A29E', label: 'Agent' };

function palette(agent: string) {
  return PALETTE[agent] ?? FALLBACK;
}

/* ═══════════════════════════════════════════════════
   Tool icon map
   ═══════════════════════════════════════════════════ */

const ICONS: Record<string, typeof Eye> = {
  read: Eye, edit: Pencil, write: FileText, glob: FolderSearch,
  grep: Search, bash: Terminal, webfetch: Globe, websearch: Globe, task: Brain,
};

/* ═══════════════════════════════════════════════════
   Elapsed timer
   ═══════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════
   Compact tool chip — single inline element
   ═══════════════════════════════════════════════════ */

function ToolChip({ tc, accent }: { tc: CodeLabToolCall; accent: string }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[tc.tool] ?? Terminal;
  const inp = tc.input as Record<string, any>;
  const raw = inp?.file_path || inp?.filePath || inp?.path || inp?.pattern || inp?.command || '';
  // Show only the filename, not the full path
  const label = typeof raw === 'string' && raw.includes('/')
    ? raw.split('/').pop() ?? raw
    : (raw || tc.title || tc.tool);
  const shortLabel = typeof label === 'string' && label.length > 28
    ? label.slice(0, 25) + '…'
    : label;
  const isRunning = tc.status === 'running';

  return (
    <span className="inline-flex items-center flex-shrink-0 relative">
      <button
        onClick={() => tc.output && setOpen(!open)}
        disabled={!tc.output}
        className="inline-flex items-center gap-[3px] text-[10.5px] font-mono leading-none whitespace-nowrap transition-opacity hover:opacity-100"
        style={{ color: isRunning ? accent : undefined, opacity: isRunning ? 1 : 0.55 }}
      >
        <Icon size={10} className="flex-shrink-0" style={{ opacity: 0.7 }} />
        <span>{shortLabel}</span>
        {isRunning && <Loader2 size={9} className="animate-spin flex-shrink-0" />}
      </button>
      {/* Expandable output popover */}
      {open && tc.output && (
        <div className="absolute left-0 top-full mt-1 z-20 w-72 max-h-32 overflow-auto rounded-md bg-card border border-border/40 shadow-lg px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground/60 animate-fade-in">
          {tc.output.slice(0, 600)}
          {tc.output.length > 600 && <span className="opacity-40">…</span>}
        </div>
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════════════
   Branch — a single agent's row in the tree
   ═══════════════════════════════════════════════════ */

function Branch({ task, isLast, index }: { task: ParallelTaskInfo; isLast: boolean; index: number }) {
  const p = palette(task.agent);
  const elapsed = useElapsed(task.startTime, task.endTime);
  const isRunning = task.status === 'running';
  const isDone = task.status === 'completed';
  const isError = task.status === 'error' || task.status === 'timeout';
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter out empty pending tool calls (no input, no title — just noise)
  const visibleTools = task.toolCalls.filter((tc) => {
    if (tc.status === 'pending') return false;
    const inp = tc.input as Record<string, any>;
    const hasData = inp?.file_path || inp?.filePath || inp?.path || inp?.pattern || inp?.command || tc.title !== tc.tool;
    return tc.status === 'completed' || hasData;
  });

  // Auto-scroll tool strip to end
  useEffect(() => {
    if (scrollRef.current && isRunning) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [visibleTools.length, isRunning]);

  return (
    <div
      className="relative animate-fade-in-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* ── Branch connector lines ── */}
      {/* Vertical line continuing from above */}
      <div
        className="absolute left-[7px] top-0 w-px"
        style={{
          height: isLast ? '14px' : '100%',
          background: 'var(--color-warm)',
          opacity: 0.15,
        }}
      />
      {/* Horizontal branch line */}
      <div
        className="absolute left-[7px] top-[14px] h-px"
        style={{
          width: '14px',
          background: 'var(--color-warm)',
          opacity: 0.15,
        }}
      />

      {/* ── Branch content ── */}
      <div className="pl-7 py-[6px]">
        {/* Agent header line */}
        <div className="flex items-center gap-1.5 mb-[3px]">
          {/* Status dot */}
          <div className="relative flex-shrink-0">
            <div
              className="w-[6px] h-[6px] rounded-full"
              style={{ backgroundColor: p.color }}
            />
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

          {/* Status + timer */}
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/35 flex-shrink-0 tabular-nums font-mono">
            {isDone && <Check size={10} style={{ color: p.color }} />}
            {isError && <AlertTriangle size={10} className="text-destructive/60" />}
            {isRunning && <Clock size={9} className="opacity-50" />}
            {elapsed}
          </span>
        </div>

        {/* Tool call strip — horizontal scrolling */}
        {(visibleTools.length > 0 || isRunning) && (
          <div
            ref={scrollRef}
            className="flex items-center gap-[6px] overflow-x-auto scrollbar-none text-muted-foreground/60"
            style={{ maskImage: 'linear-gradient(to right, black 90%, transparent)' }}
          >
            {visibleTools.map((tc) => (
              <ToolChip key={tc.id} tc={tc} accent={p.color} />
            ))}
            {isRunning && visibleTools.length === 0 && (
              <span className="text-[10px] italic text-muted-foreground/30 flex items-center gap-1">
                <Loader2 size={9} className="animate-spin" style={{ color: p.color }} />
                initializing
              </span>
            )}
          </div>
        )}

        {/* Summary on completion */}
        {isDone && task.summary && (
          <p className="mt-1 text-[10.5px] text-muted-foreground/40 line-clamp-1">
            {task.summary}
          </p>
        )}
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
      {/* ── Fork header ── */}
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

      {/* ── Tree branches ── */}
      <div className="relative ml-1">
        {tasks.map((task, i) => (
          <Branch
            key={task.id}
            task={task}
            isLast={i === tasks.length - 1}
            index={i}
          />
        ))}
      </div>

      {/* ── Converge line ── */}
      {allDone && (
        <div className="flex items-center gap-2 mt-1 ml-1 animate-fade-in">
          <div
            className="w-[7px] h-px flex-shrink-0"
            style={{ background: 'var(--color-warm)', opacity: 0.15 }}
          />
          <div className="flex-1 h-px bg-border/30" />
          <span className="text-[9px] text-muted-foreground/25 italic pr-1">converged</span>
          <div className="flex-1 h-px bg-border/30" />
        </div>
      )}
    </div>
  );
}
