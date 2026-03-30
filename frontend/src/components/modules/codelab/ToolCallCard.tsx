'use client';

import { useState } from 'react';
import {
  FileText, Search, Terminal, Pencil, Eye, FolderSearch,
  Loader2, ChevronRight, Globe,
} from 'lucide-react';
import type { CodeLabToolCall } from '@/stores/module-stores/codelab-store';

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
  const [expanded, setExpanded] = useState(false);
  const meta = TOOLS[toolCall.tool] || { icon: Terminal, label: toolCall.tool };
  const Icon = meta.icon;
  const inp = toolCall.input as Record<string, any>;
  const isRunning = toolCall.status === 'running';
  const fp = inp?.file_path || inp?.path || inp?.filepath || '';

  // Hide ghost entries: completed with no file path, no output, and generic title
  const hasContent = fp || toolCall.output || (toolCall.title && toolCall.title !== toolCall.tool);
  if (!isRunning && !hasContent) return null;

  // Tool-specific display
  const t = toolCall.tool;
  const out = toolCall.output || '';

  let title = toolCall.title || t;
  let badge: string | null = null;
  let expandable = false;
  let showDiff = false;

  if (t === 'read') {
    title = shortPath(fp) || title;
    badge = isRunning ? null : `${out ? out.split('\n').length : 0} lines`;
  } else if (t === 'write') {
    title = shortPath(fp) || title;
    const content = inp?.content || out;
    badge = isRunning ? null : `${content ? content.split('\n').length : 0} lines`;
  } else if (t === 'edit') {
    title = shortPath(fp) || title;
    showDiff = !!(inp?.old_string || inp?.new_string);
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

  const canToggle = expandable;
  const borderColor = isRunning
    ? 'border-l-[var(--color-warm)]/50'
    : 'border-l-border/40';

  return (
    <div className={`border-l-2 ${borderColor} pl-3 my-1 transition-colors duration-300`}>
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

      {/* Inline diff for edit tools */}
      {showDiff && toolCall.status === 'completed' && (
        <EditDiff oldStr={inp?.old_string} newStr={inp?.new_string} />
      )}

      {/* Expandable output */}
      {expandable && expanded && out && (
        <pre className="mt-1 mb-1 rounded-md border border-border/10 bg-foreground/[0.015] px-3 py-2 font-mono text-[10.5px] text-muted-foreground/50 leading-[1.7] max-h-36 overflow-y-auto whitespace-pre-wrap">
          {out.slice(0, 2000)}
          {out.length > 2000 && '\n…'}
        </pre>
      )}
    </div>
  );
}

/* ── Inline diff for edit tools ── */

function EditDiff({ oldStr, newStr }: { oldStr?: string; newStr?: string }) {
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
