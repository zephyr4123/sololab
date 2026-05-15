'use client';

/**
 * UnifiedDiff — Myers-LCS unified diff viewer for `edit` tool results.
 *
 * Extracted from the legacy ToolCallCard into its own file so:
 *  - InlineDiff (fallback path) can sit beside it without one giant module
 *  - the diff algorithm is independently testable (pure function below)
 *
 * Styling moved off Tailwind colour names and onto `.codelab-diff-*`
 * tokens so the diff palette can be re-tuned globally without touching
 * the component tree.
 */

import { useMemo } from 'react';
import type { FileDiff } from '@/stores/module-stores/codelab-store';

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldNum?: number;
  newNum?: number;
}

const CONTEXT_LINES = 3;

/** Naive fallback when the file is too large to run Myers on. */
function simpleDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  oldLines.forEach((l, i) => result.push({ type: 'remove', content: l, oldNum: i + 1 }));
  newLines.forEach((l, i) => result.push({ type: 'add', content: l, newNum: i + 1 }));
  return result;
}

export function computeUnifiedDiff(before: string, after: string): DiffLine[] {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  const m = oldLines.length;
  const n = newLines.length;
  if (m + n > 2000) return simpleDiff(oldLines, newLines);

  const max = m + n;
  const v = new Int32Array(2 * max + 1).fill(-1);
  const trace: Int32Array[] = [];
  v[max + 1] = 0;
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[max + k - 1] < v[max + k + 1])) {
        x = v[max + k + 1];
      } else {
        x = v[max + k - 1] + 1;
      }
      let y = x - k;
      while (x < m && y < n && oldLines[x] === newLines[y]) { x++; y++; }
      v[max + k] = x;
      if (x >= m && y >= n) break outer;
    }
  }

  const edits: Array<{ type: 'context' | 'add' | 'remove'; line: string; oldIdx?: number; newIdx?: number }> = [];
  let x = m, y = n;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vPrev = trace[d];
    const k = x - y;
    const prevK = (k === -d || (k !== d && vPrev[max + k - 1] < vPrev[max + k + 1])) ? k + 1 : k - 1;
    const prevX = vPrev[max + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--; y--;
      edits.unshift({ type: 'context', line: oldLines[x], oldIdx: x, newIdx: y });
    }
    if (d > 0) {
      if (x === prevX) {
        y--;
        edits.unshift({ type: 'add', line: newLines[y], newIdx: y });
      } else {
        x--;
        edits.unshift({ type: 'remove', line: oldLines[x], oldIdx: x });
      }
    }
  }

  // Trim runs of context to ±CONTEXT_LINES around each change
  const keep = new Set<number>();
  edits.forEach((e, i) => {
    if (e.type === 'context') return;
    for (let j = Math.max(0, i - CONTEXT_LINES); j <= Math.min(edits.length - 1, i + CONTEXT_LINES); j++) {
      keep.add(j);
    }
  });

  const result: DiffLine[] = [];
  let lastKept = -1;
  edits.forEach((e, i) => {
    if (!keep.has(i)) return;
    if (lastKept >= 0 && i - lastKept > 1) result.push({ type: 'context', content: '···' });
    result.push({
      type: e.type,
      content: e.line,
      oldNum: e.type !== 'add' ? (e.oldIdx ?? 0) + 1 : undefined,
      newNum: e.type !== 'remove' ? (e.newIdx ?? 0) + 1 : undefined,
    });
    lastKept = i;
  });
  return result;
}

export function UnifiedDiff({ fileDiff }: { fileDiff: FileDiff }) {
  const lines = useMemo(
    () => computeUnifiedDiff(fileDiff.before, fileDiff.after),
    [fileDiff.before, fileDiff.after],
  );
  if (lines.length === 0) return null;

  return (
    <div className="codelab-diff-shell">
      {lines.map((line, i) => {
        if (line.content === '···') {
          return (
            <div
              key={i}
              className="select-none text-center text-[9px] text-muted-foreground/30 py-0.5"
            >
              ···
            </div>
          );
        }
        const rowCls =
          line.type === 'remove' ? 'codelab-diff-row-rem'
          : line.type === 'add'  ? 'codelab-diff-row-add'
          : '';
        const sign = line.type === 'remove' ? '−' : line.type === 'add' ? '+' : ' ';
        const signCls =
          line.type === 'remove' ? 'codelab-diff-sign-rem'
          : line.type === 'add'  ? 'codelab-diff-sign-add'
          : 'text-transparent';
        const textCls =
          line.type === 'context' ? 'text-foreground/30' : 'text-foreground/65';

        return (
          <div key={i} className={`flex ${rowCls}`}>
            <span className="shrink-0 w-8 text-right pr-1 text-[9.5px] text-muted-foreground/25 select-none tabular-nums">
              {line.oldNum ?? ''}
            </span>
            <span className="shrink-0 w-8 text-right pr-1.5 text-[9.5px] text-muted-foreground/25 select-none tabular-nums border-r border-border/10">
              {line.newNum ?? ''}
            </span>
            <span className={`shrink-0 w-4 text-center select-none ${signCls}`}>{sign}</span>
            <span className={`flex-1 px-1 whitespace-pre ${textCls}`}>{line.content}</span>
          </div>
        );
      })}
    </div>
  );
}
