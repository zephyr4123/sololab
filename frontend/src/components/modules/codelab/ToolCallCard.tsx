'use client';

import { useState } from 'react';
import {
  ChevronRight, ChevronDown,
  FileText, Search, Terminal, Pencil, Eye, Globe, FolderSearch,
  Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import type { CodeLabToolCall } from '@/stores/module-stores/codelab-store';

const TOOL_ICONS: Record<string, typeof FileText> = {
  read: Eye,
  edit: Pencil,
  write: FileText,
  glob: FolderSearch,
  grep: Search,
  bash: Terminal,
  webfetch: Globe,
  websearch: Globe,
};

const STATUS_ICONS: Record<string, typeof Loader2> = {
  running: Loader2,
  completed: CheckCircle2,
  error: XCircle,
};

export function ToolCallCard({ toolCall }: { toolCall: CodeLabToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const Icon = TOOL_ICONS[toolCall.tool] ?? Terminal;
  const StatusIcon = STATUS_ICONS[toolCall.status] ?? Loader2;

  // Extract a short title from tool input
  const title = toolCall.title
    ?? (toolCall.input as any)?.file_path
    ?? (toolCall.input as any)?.command?.slice(0, 60)
    ?? (toolCall.input as any)?.pattern
    ?? toolCall.tool;

  return (
    <div className="group rounded-lg border border-border/40 bg-card/40 text-xs overflow-hidden transition-colors hover:border-border/60">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground/50 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
        )}
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate font-mono text-[11px] text-foreground/80">
          {title}
        </span>
        <StatusIcon
          className={`h-3 w-3 shrink-0 ${
            toolCall.status === 'running'
              ? 'animate-spin text-[var(--color-warm)]'
              : toolCall.status === 'completed'
                ? 'text-emerald-500'
                : 'text-destructive'
          }`}
        />
      </button>

      {expanded && toolCall.output && (
        <div className="border-t border-border/30 bg-muted/30 px-3 py-2">
          <pre className="whitespace-pre-wrap font-mono text-[11px] text-muted-foreground leading-relaxed max-h-48 overflow-y-auto">
            {toolCall.output.slice(0, 2000)}
            {toolCall.output.length > 2000 && '\n... (truncated)'}
          </pre>
        </div>
      )}
    </div>
  );
}
