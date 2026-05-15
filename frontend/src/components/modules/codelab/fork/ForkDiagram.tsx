'use client';

/**
 * ForkDiagram — vertical fan-out visualisation of parallel agent runs.
 *
 * Replaces the legacy ParallelTaskView "tree of straight lines". The
 * new layout treats the message stream itself as the timeline:
 *
 *      │
 *      ├──● BUILD     · implement /api/foo
 *      │    bash $ pytest tests/api/
 *      │
 *      ├──● EXPLORE   · scan auth middleware
 *      │    grep "session_token"
 *      │
 *      └──● PLAN      · revise migration strategy
 *           planning…
 *
 *      ─── converged · 3 agents · 41s ───
 *
 * Why this shape:
 *   - vertical reads top-down (matches the chat thread direction)
 *   - the central axis is a real vertical rule, making "these all
 *     stem from the same fork" visually unambiguous
 *   - each spoke dot is colored per-agent so the eye can track
 *     each craftsman without reading labels
 *   - on completion, the axis goes grey and a converged-rule
 *     replaces the live status text — a clear ending punctuation
 */

import type { ParallelTaskGroup } from '@/stores/module-stores/codelab-store';
import { ForkSpoke } from './ForkSpoke';

const SLOT_HEIGHT = 56;
const VERTICAL_PAD = 14;

export function ForkDiagram({ group }: { group: ParallelTaskGroup }) {
  const { tasks } = group;
  if (tasks.length === 0) return null;

  const running = tasks.filter((t) => t.status === 'running').length;
  const allDone = group.status === 'completed';

  const total = tasks.length;
  const containerHeight = VERTICAL_PAD * 2 + total * SLOT_HEIGHT;

  return (
    <section className={`my-3 select-none ${allDone ? 'fork-converged' : ''}`}>
      {/* Fork header — small caps with live count */}
      <div className="flex items-center gap-3 pl-1 mb-1">
        <span className="atelier-eyebrow-sm">Fork · Parallel</span>
        <span aria-hidden className="h-px w-6 bg-warm/30" />
        <span
          className="text-[10.5px] tabular-nums text-muted-foreground/55 tracking-tight"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {running > 0
            ? `${total} 个智能体 · ${running} 进行中`
            : `${total} 个智能体 · ${tasks.filter((t) => t.status === 'completed').length} 已完成`}
        </span>
      </div>

      {/* The actual fan */}
      <div className="relative ml-1" style={{ height: containerHeight }}>
        <span aria-hidden className="fork-axis" />
        {tasks.map((task, i) => (
          <ForkSpoke key={task.id} task={task} index={i} />
        ))}
      </div>

      {/* Converged punctuation — appears once all spokes finish */}
      {allDone && (
        <div className="flex items-center gap-3 mt-1 ml-1 animate-fade-in">
          <span aria-hidden className="h-px flex-1 bg-border/30" />
          <span
            className="text-[9.5px] uppercase tracking-[0.32em] text-muted-foreground/45"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            converged
          </span>
          <span aria-hidden className="h-px flex-1 bg-border/30" />
        </div>
      )}
    </section>
  );
}
