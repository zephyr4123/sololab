'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  GitFork, Check, AlertTriangle, Clock, Loader2,
  Eye, Pencil, FileText, FolderSearch, Search, Terminal, Globe, Brain,
  ChevronDown, Zap,
} from 'lucide-react';
import type { ParallelTaskGroup, ParallelTaskInfo, CodeLabToolCall } from '@/stores/module-stores/codelab-store';

/* ═══════════════════════════════════════════════════
   Agent visual identities — colors, icons, labels
   ═══════════════════════════════════════════════════ */

const AGENT_PALETTE: Record<string, { accent: string; glow: string; bg: string; label: string }> = {
  explore: {
    accent: '#7CB3E0',
    glow: 'rgba(124,179,224,0.3)',
    bg: 'rgba(124,179,224,0.08)',
    label: 'Explorer',
  },
  general: {
    accent: '#C9A87C',
    glow: 'rgba(201,168,124,0.3)',
    bg: 'rgba(201,168,124,0.08)',
    label: 'General',
  },
  plan: {
    accent: '#A78BFA',
    glow: 'rgba(167,139,250,0.3)',
    bg: 'rgba(167,139,250,0.08)',
    label: 'Planner',
  },
  build: {
    accent: '#6EE7A0',
    glow: 'rgba(110,231,160,0.3)',
    bg: 'rgba(110,231,160,0.08)',
    label: 'Builder',
  },
};

const DEFAULT_PALETTE = {
  accent: '#A8A29E',
  glow: 'rgba(168,162,158,0.3)',
  bg: 'rgba(168,162,158,0.08)',
  label: 'Agent',
};

function getAgentPalette(agent: string) {
  return AGENT_PALETTE[agent] ?? DEFAULT_PALETTE;
}

/* ═══════════════════════════════════════════════════
   Tool icon resolver
   ═══════════════════════════════════════════════════ */

const TOOL_ICONS: Record<string, typeof Eye> = {
  read: Eye, edit: Pencil, write: FileText, glob: FolderSearch,
  grep: Search, bash: Terminal, webfetch: Globe, websearch: Globe,
  task: Brain,
};

function ToolIcon({ tool, size = 12 }: { tool: string; size?: number }) {
  const Icon = TOOL_ICONS[tool] ?? Terminal;
  return <Icon size={size} />;
}

/* ═══════════════════════════════════════════════════
   Elapsed timer hook
   ═══════════════════════════════════════════════════ */

function useElapsed(startTime: number, endTime?: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endTime) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endTime]);
  const elapsed = ((endTime ?? now) - startTime) / 1000;
  if (elapsed < 60) return `${Math.floor(elapsed)}s`;
  return `${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`;
}

/* ═══════════════════════════════════════════════════
   Individual tool call node — compact inline
   ═══════════════════════════════════════════════════ */

function ToolNode({ tc, accent }: { tc: CodeLabToolCall; accent: string }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = tc.status === 'running';
  const inp = tc.input as Record<string, any>;
  const fp = inp?.file_path || inp?.path || inp?.pattern || inp?.command || '';
  const shortFp = typeof fp === 'string' && fp.length > 40 ? '…' + fp.slice(-35) : fp;

  return (
    <div
      className="group relative pl-5 py-[3px] transition-all duration-200"
      style={{ '--node-accent': accent } as React.CSSProperties}
    >
      {/* Timeline dot */}
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 w-[7px] h-[7px] rounded-full border-[1.5px] transition-all duration-300"
        style={{
          borderColor: accent,
          backgroundColor: isRunning ? accent : tc.status === 'error' ? '#EF4444' : 'transparent',
          boxShadow: isRunning ? `0 0 8px ${accent}40` : 'none',
        }}
      />
      {/* Content */}
      <button
        onClick={() => tc.output && setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] leading-tight w-full text-left"
        disabled={!tc.output}
      >
        <span className="opacity-50" style={{ color: accent }}>
          <ToolIcon tool={tc.tool} size={11} />
        </span>
        <span className="font-mono text-muted-foreground/70 truncate flex-1">
          {tc.tool === 'bash' ? `$ ${shortFp}` : shortFp || tc.title || tc.tool}
        </span>
        {isRunning && (
          <Loader2 size={10} className="animate-spin opacity-40 flex-shrink-0" style={{ color: accent }} />
        )}
        {tc.status === 'completed' && tc.output && (
          <ChevronDown
            size={10}
            className={`opacity-30 group-hover:opacity-60 transition-all flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
          />
        )}
        {tc.status === 'error' && (
          <AlertTriangle size={10} className="text-destructive/60 flex-shrink-0" />
        )}
      </button>
      {/* Expanded output */}
      {expanded && tc.output && (
        <div className="mt-1 ml-4 text-[10px] font-mono text-muted-foreground/50 max-h-24 overflow-auto rounded bg-card/50 px-2 py-1 border border-border/30 animate-fade-in">
          {tc.output.slice(0, 500)}
          {tc.output.length > 500 && <span className="opacity-40">…</span>}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Single Task Lane — one agent's timeline
   ═══════════════════════════════════════════════════ */

function TaskLane({ task, index }: { task: ParallelTaskInfo; index: number }) {
  const palette = getAgentPalette(task.agent);
  const elapsed = useElapsed(task.startTime, task.endTime);
  const isRunning = task.status === 'running';
  const isDone = task.status === 'completed';
  const isError = task.status === 'error' || task.status === 'timeout';
  const laneRef = useRef<HTMLDivElement>(null);

  // Auto-scroll lane to bottom as new tool calls arrive
  useEffect(() => {
    if (laneRef.current && isRunning) {
      laneRef.current.scrollTop = laneRef.current.scrollHeight;
    }
  }, [task.toolCalls.length, isRunning]);

  return (
    <div
      className="task-lane relative flex flex-col rounded-lg overflow-hidden transition-all duration-500"
      style={{
        animationDelay: `${index * 80}ms`,
        background: palette.bg,
        border: `1px solid ${palette.accent}18`,
      }}
    >
      {/* ── Lane Header ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ borderColor: `${palette.accent}15` }}
      >
        {/* Pulsing status orb */}
        <div className="relative flex-shrink-0">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: palette.accent }}
          />
          {isRunning && (
            <div
              className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
              style={{ backgroundColor: palette.accent, opacity: 0.4 }}
            />
          )}
        </div>

        <span
          className="text-[11px] font-semibold tracking-wide uppercase"
          style={{ color: palette.accent }}
        >
          {palette.label}
        </span>

        <span className="text-[10px] text-muted-foreground/50 truncate flex-1">
          {task.description}
        </span>

        {/* Timer / Status */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/40 flex-shrink-0">
          {isRunning && <Clock size={10} className="opacity-60" />}
          {isDone && <Check size={10} style={{ color: palette.accent }} />}
          {isError && <AlertTriangle size={10} className="text-destructive/60" />}
          <span className="font-mono tabular-nums">{elapsed}</span>
        </div>
      </div>

      {/* ── Tool Call Timeline ── */}
      <div
        ref={laneRef}
        className="relative flex-1 overflow-y-auto px-3 py-1.5 min-h-[32px] max-h-[200px]"
      >
        {/* Vertical timeline line */}
        {task.toolCalls.length > 0 && (
          <div
            className="absolute left-[14.5px] top-2 bottom-2 w-px"
            style={{
              background: `linear-gradient(to bottom, ${palette.accent}30, ${palette.accent}08)`,
            }}
          />
        )}

        {task.toolCalls.length === 0 && isRunning && (
          <div className="flex items-center gap-1.5 py-1 text-[11px] text-muted-foreground/40 italic">
            <Loader2 size={10} className="animate-spin" style={{ color: palette.accent }} />
            <span>Initializing…</span>
          </div>
        )}

        {task.toolCalls.map((tc) => (
          <ToolNode key={tc.id} tc={tc} accent={palette.accent} />
        ))}

        {/* Running trail indicator */}
        {isRunning && task.toolCalls.length > 0 && (
          <div className="pl-5 py-1">
            <div className="flex items-center gap-1">
              <span
                className="block w-1 h-1 rounded-full animate-pulse"
                style={{ backgroundColor: palette.accent, opacity: 0.5 }}
              />
              <span
                className="block w-1 h-1 rounded-full animate-pulse"
                style={{ backgroundColor: palette.accent, opacity: 0.3, animationDelay: '200ms' }}
              />
              <span
                className="block w-1 h-1 rounded-full animate-pulse"
                style={{ backgroundColor: palette.accent, opacity: 0.15, animationDelay: '400ms' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Summary (on completion) ── */}
      {isDone && task.summary && (
        <div
          className="px-3 py-2 text-[11px] text-muted-foreground/60 border-t animate-fade-in"
          style={{ borderColor: `${palette.accent}15` }}
        >
          {task.summary.slice(0, 120)}
          {task.summary.length > 120 && '…'}
        </div>
      )}

      {/* ── Completion flash overlay ── */}
      {isDone && (
        <div
          className="absolute inset-0 pointer-events-none task-lane-flash"
          style={{
            background: `linear-gradient(135deg, ${palette.accent}08, transparent)`,
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Main: ParallelTaskView — the fork-join visualization
   ═══════════════════════════════════════════════════ */

export function ParallelTaskView({ group }: { group: ParallelTaskGroup }) {
  const { tasks } = group;
  const runningCount = tasks.filter((t) => t.status === 'running').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const totalToolCalls = tasks.reduce((sum, t) => sum + t.toolCalls.length, 0);
  const allDone = group.status === 'completed';

  // Determine grid layout based on task count
  const gridCols = useMemo(() => {
    if (tasks.length === 1) return 'grid-cols-1';
    if (tasks.length === 2) return 'grid-cols-1 md:grid-cols-2';
    if (tasks.length === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2';
  }, [tasks.length]);

  return (
    <div className="parallel-task-container my-3 animate-fade-in-up">
      {/* ── Fork Header ── */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground/70">
          <GitFork size={14} className="text-warm rotate-180" />
          <span style={{ fontFamily: 'var(--font-display)' }}>
            Parallel Agents
          </span>
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-1.5 ml-auto">
          {runningCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-warm/10 text-warm">
              <Zap size={9} />
              {runningCount} active
            </span>
          )}
          {completedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-card text-muted-foreground/60 border border-border/30">
              <Check size={9} />
              {completedCount}/{tasks.length}
            </span>
          )}
          {totalToolCalls > 0 && (
            <span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums">
              {totalToolCalls} calls
            </span>
          )}
        </div>
      </div>

      {/* ── Parallel Lanes Grid ── */}
      <div className={`grid ${gridCols} gap-2`}>
        {tasks.map((task, i) => (
          <TaskLane key={task.id} task={task} index={i} />
        ))}
      </div>

      {/* ── Join Footer (when all complete) ── */}
      {allDone && (
        <div className="flex items-center gap-2 mt-2 animate-fade-in">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <span className="text-[10px] text-muted-foreground/40 italic">
            All agents converged
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>
      )}
    </div>
  );
}
