'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  FileText, Search, Terminal, Pencil, Eye, FolderSearch,
  Loader2, ChevronRight, Globe, FilePlus,
} from 'lucide-react';
import type { CodeLabToolCall, FileDiff } from '@/stores/module-stores/codelab-store';

const TOOLS: Record<string, { icon: typeof Eye; label: string }> = {
  read:      { icon: Eye,          label: 'Read' },
  edit:      { icon: Pencil,       label: 'Edit' },
  write:     { icon: FileText,     label: 'Write' },
  glob:      { icon: FolderSearch, label: 'Glob' },
  grep:      { icon: Search,       label: 'Grep' },
  bash:      { icon: Terminal,     label: '' },
  webfetch:  { icon: Globe,        label: 'Fetch' },
  websearch: { icon: Globe,        label: 'Search' },
};

function shortPath(p: string): string {
  if (!p) return '';
  const parts = p.split('/').filter(Boolean);
  return parts.length <= 3 ? parts.join('/') : '…/' + parts.slice(-2).join('/');
}

export function ToolCallCard({ toolCall }: { toolCall: CodeLabToolCall }) {
  const hasDiffContent = Boolean(toolCall.fileDiff) || Boolean(toolCall.tool === 'edit' && toolCall.input?.oldString && toolCall.status === 'completed');
  const [expanded, setExpanded] = useState(hasDiffContent);

  // Auto-expand when diff arrives (edit completes while card was collapsed)
  useEffect(() => {
    if (hasDiffContent) setExpanded(true);
  }, [hasDiffContent]);
  const meta = TOOLS[toolCall.tool] || { icon: Terminal, label: toolCall.tool };
  const Icon = toolCall.isNewFile ? FilePlus : meta.icon;
  const inp = toolCall.input as Record<string, any>;
  const isRunning = toolCall.status === 'running';
  const fp = inp?.file_path || inp?.path || inp?.filepath || '';

  // Hide ghost entries: completed with no file path, no output, and generic title
  const hasContent = fp || toolCall.output || (toolCall.title && toolCall.title !== toolCall.tool);
  if (!isRunning && !hasContent) return null;

  // Tool-specific display
  const t = toolCall.tool;
  const out = toolCall.output || '';
  const fileDiff = toolCall.fileDiff;

  let title = toolCall.title || t;
  let badge: string | null = null;
  let expandable = false;
  let showInlineDiff = false;
  let showFileDiff = false;

  if (t === 'read') {
    title = shortPath(fp) || title;
    badge = isRunning ? null : `${out ? out.split('\n').length : 0} lines`;
  } else if (t === 'write') {
    title = shortPath(fp) || title;
    const content = inp?.content || out;
    badge = isRunning
      ? null
      : toolCall.isNewFile
        ? `new · ${content ? content.split('\n').length : 0} lines`
        : `${content ? content.split('\n').length : 0} lines`;
  } else if (t === 'edit') {
    title = shortPath(fp) || title;
    if (fileDiff && toolCall.status === 'completed') {
      showFileDiff = true;
      badge = `+${fileDiff.additions} −${fileDiff.deletions}`;
    } else if (inp?.old_string || inp?.new_string) {
      showInlineDiff = true;
    }
  } else if (t === 'glob') {
    title = inp?.pattern || title;
    const n = out ? out.split('\n').filter((l: string) => l.trim()).length : 0;
    badge = isRunning ? null : `${n} files`;
    expandable = !!out && n > 0;
  } else if (t === 'grep') {
    title = inp?.pattern ? `"${inp.pattern}"` : title;
    const n = out ? out.split('\n').filter((l: string) => l.trim()).length : 0;
    badge = isRunning ? null : `${n} results`;
    expandable = !!out && n > 0;
  } else if (t === 'bash') {
    title = inp?.command || title;
    expandable = !!out;
  } else {
    expandable = !!out;
  }

  const hasDiff = showFileDiff || showInlineDiff;
  const canToggle = expandable || hasDiff;
  const borderColor = isRunning
    ? 'border-l-[var(--color-warm)]/50'
    : 'border-l-border/40';

  return (
    <div className={`border-l-2 ${borderColor} pl-3 my-1 transition-colors duration-300 ${isRunning ? 'tool-call-active' : ''}`}>
      {/* Header row */}
      <div
        className={`group/tc flex items-center gap-2 rounded-md py-1 px-1.5 -ml-1.5 transition-colors ${
          canToggle ? 'cursor-pointer hover:bg-foreground/[0.03]' : ''
        } ${toolCall.status === 'error' ? 'opacity-40' : ''}`}
        onClick={canToggle ? () => setExpanded(!expanded) : undefined}
      >
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--color-warm)]/70" />
        ) : (
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
        )}

        {meta.label && (
          <span className="text-[11px] font-medium text-muted-foreground/45 shrink-0 tracking-wide">
            {meta.label}
          </span>
        )}

        <span className="truncate font-mono text-[11.5px] text-foreground/55 tracking-tight">
          {t === 'bash' && <span className="text-[var(--color-warm)]/50 mr-0.5">$</span>}
          {title}
        </span>

        {badge && (
          <span className="text-[10px] text-muted-foreground/25 shrink-0 tabular-nums ml-auto">
            {badge}
          </span>
        )}

        {canToggle && (
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-muted-foreground/20 transition-transform duration-200 ${
              expanded ? 'rotate-90' : ''
            } ${!badge ? 'ml-auto' : ''}`}
          />
        )}
      </div>

      {/* Unified file diff for edit tools (from metadata.filediff) */}
      {showFileDiff && fileDiff && expanded && (
        <UnifiedDiff fileDiff={fileDiff} />
      )}

      {/* Fallback inline diff for edit tools (from input.oldString/newString, no fileDiff yet) */}
      {showInlineDiff && !showFileDiff && toolCall.status === 'completed' && (
        <InlineDiff oldStr={inp?.old_string} newStr={inp?.new_string} />
      )}

      {/* Expandable output for other tools */}
      {expandable && expanded && out && (
        <pre className="mt-1 mb-1 rounded-md border border-border/10 bg-foreground/[0.015] px-3 py-2 font-mono text-[10.5px] text-muted-foreground/50 leading-[1.7] max-h-36 overflow-y-auto whitespace-pre-wrap">
          {out.slice(0, 2000)}
          {out.length > 2000 && '\n…'}
        </pre>
      )}
    </div>
  );
}

/* ── Unified diff viewer (from fileDiff.before/after) ── */

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldNum?: number;
  newNum?: number;
}

function computeUnifiedDiff(before: string, after: string): DiffLine[] {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');

  // Simple LCS-based diff for reasonable file sizes
  const m = oldLines.length;
  const n = newLines.length;

  // For large files, fall back to simple line comparison
  if (m + n > 2000) {
    return simpleDiff(oldLines, newLines);
  }

  // Myers-like diff using forward/reverse edit graph (simplified)
  const max = m + n;
  const vSize = 2 * max + 1;
  const v = new Int32Array(vSize).fill(-1);
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
      while (x < m && y < n && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }
      v[max + k] = x;
      if (x >= m && y >= n) break outer;
    }
  }

  // Backtrack to find the edit script
  const edits: Array<{ type: 'context' | 'add' | 'remove'; line: string; oldIdx?: number; newIdx?: number }> = [];
  let x = m, y = n;

  for (let d = trace.length - 1; d >= 0; d--) {
    const vPrev = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vPrev[max + k - 1] < vPrev[max + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vPrev[max + prevK];
    const prevY = prevX - prevK;

    // Diagonal (context)
    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.unshift({ type: 'context', line: oldLines[x], oldIdx: x, newIdx: y });
    }
    if (d > 0) {
      if (x === prevX) {
        // Insert
        y--;
        edits.unshift({ type: 'add', line: newLines[y], newIdx: y });
      } else {
        // Delete
        x--;
        edits.unshift({ type: 'remove', line: oldLines[x], oldIdx: x });
      }
    }
  }

  // Convert to DiffLine with line numbers, keeping only context around changes
  const result: DiffLine[] = [];
  const CONTEXT = 3;
  const changeIndices = new Set<number>();

  edits.forEach((e, i) => {
    if (e.type !== 'context') {
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(edits.length - 1, i + CONTEXT); j++) {
        changeIndices.add(j);
      }
    }
  });

  let lastIncluded = -1;
  edits.forEach((e, i) => {
    if (!changeIndices.has(i)) return;
    if (lastIncluded >= 0 && i - lastIncluded > 1) {
      result.push({ type: 'context', content: '···' });
    }
    result.push({
      type: e.type,
      content: e.line,
      oldNum: e.type !== 'add' ? (e.oldIdx ?? 0) + 1 : undefined,
      newNum: e.type !== 'remove' ? (e.newIdx ?? 0) + 1 : undefined,
    });
    lastIncluded = i;
  });

  return result;
}

function simpleDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  oldLines.forEach((l, i) => result.push({ type: 'remove', content: l, oldNum: i + 1 }));
  newLines.forEach((l, i) => result.push({ type: 'add', content: l, newNum: i + 1 }));
  return result;
}

function UnifiedDiff({ fileDiff }: { fileDiff: FileDiff }) {
  const lines = useMemo(
    () => computeUnifiedDiff(fileDiff.before, fileDiff.after),
    [fileDiff.before, fileDiff.after]
  );

  if (lines.length === 0) return null;

  return (
    <div className="mt-1 mb-1.5 rounded-md border border-border/15 overflow-hidden font-mono text-[10.5px] leading-[1.65] max-h-64 overflow-y-auto">
      {lines.map((line, i) => {
        if (line.content === '···') {
          return (
            <div key={i} className="px-3 py-0.5 text-muted-foreground/20 bg-foreground/[0.01] select-none text-center text-[9px]">
              ···
            </div>
          );
        }
        const bg =
          line.type === 'remove' ? 'bg-red-500/[0.07]' :
          line.type === 'add' ? 'bg-emerald-500/[0.07]' :
          'bg-transparent';
        const sign =
          line.type === 'remove' ? '−' :
          line.type === 'add' ? '+' :
          ' ';
        const signColor =
          line.type === 'remove' ? 'text-red-500/40' :
          line.type === 'add' ? 'text-emerald-500/40' :
          'text-transparent';
        const textColor =
          line.type === 'context' ? 'text-foreground/25' : 'text-foreground/50';

        return (
          <div key={i} className={`flex ${bg} hover:brightness-95 transition-[filter]`}>
            <span className="shrink-0 w-8 text-right pr-1 text-[9.5px] text-muted-foreground/15 select-none tabular-nums">
              {line.oldNum ?? ''}
            </span>
            <span className="shrink-0 w-8 text-right pr-1.5 text-[9.5px] text-muted-foreground/15 select-none tabular-nums border-r border-border/10">
              {line.newNum ?? ''}
            </span>
            <span className={`shrink-0 w-4 text-center select-none ${signColor}`}>{sign}</span>
            <span className={`flex-1 px-1 ${textColor} whitespace-pre`}>
              {line.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Fallback inline diff (old/new strings only, no full file context) ── */

function InlineDiff({ oldStr, newStr }: { oldStr?: string; newStr?: string }) {
  if (!oldStr && !newStr) return null;

  const oldLines = oldStr ? oldStr.split('\n') : [];
  const newLines = newStr ? newStr.split('\n') : [];
  const total = oldLines.length + newLines.length;
  const [open, setOpen] = useState(total <= 10);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1 text-[10px] text-muted-foreground/30 hover:text-muted-foreground/55 transition-colors font-mono tracking-wide"
      >
        {total} changed lines &rsaquo;
      </button>
    );
  }

  return (
    <div className="mt-1 mb-1 rounded-md border border-border/10 overflow-hidden font-mono text-[11px] leading-[1.6]">
      {oldLines.map((line, i) => (
        <div key={`o${i}`} className="px-3 py-[1px] bg-red-500/[0.06] text-foreground/40">
          <span className="inline-block w-3.5 text-right select-none text-red-500/35 mr-2">−</span>
          {line}
        </div>
      ))}
      {newLines.map((line, i) => (
        <div key={`n${i}`} className="px-3 py-[1px] bg-emerald-500/[0.06] text-foreground/40">
          <span className="inline-block w-3.5 text-right select-none text-emerald-500/35 mr-2">+</span>
          {line}
        </div>
      ))}
    </div>
  );
}
