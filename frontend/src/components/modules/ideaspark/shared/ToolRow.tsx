'use client';

/**
 * ToolRow — a single tool invocation rendered as a hairline chip row.
 *
 * No box, no border. Just an inline glyph + label + truncated query +
 * status badge. Spacing carries the rhythm — when stacked, rows form an
 * orderly column without visual fences between them.
 */

import { Globe, BookOpen, FileText, Loader2, Check } from 'lucide-react';

const TOOL_ICONS: Record<string, typeof Globe> = {
  web_search: Globe,
  arxiv_search: BookOpen,
  scholar_search: BookOpen,
  doc_parse: FileText,
};

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Web',
  arxiv_search: 'arXiv',
  scholar_search: 'Scholar',
  doc_parse: 'Docs',
};

export interface ToolRowData {
  tool: string;
  query: string;
  resultCount: number | null;
  inflight: boolean;
  error?: string;
}

export function ToolRow({ tool }: { tool: ToolRowData }) {
  const Icon = TOOL_ICONS[tool.tool] ?? BookOpen;
  const label = TOOL_LABELS[tool.tool] ?? tool.tool;
  const isErr = !!tool.error;

  return (
    <div className="group/tool flex items-center gap-2.5 py-[3px] text-[11px] font-mono">
      {tool.inflight ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-warm/70" />
      ) : isErr ? (
        <span className="h-3 w-3 shrink-0 rounded-full bg-destructive/50" />
      ) : (
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground/45" />
      )}
      <span className="shrink-0 tracking-wider uppercase text-[9.5px] text-muted-foreground/55">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground/65 tracking-tight">
        {tool.query || '…'}
      </span>
      {tool.resultCount != null && !isErr && (
        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted-foreground/55 tabular-nums">
          <Check className="h-2.5 w-2.5 text-warm/55" />
          {tool.resultCount}
        </span>
      )}
      {isErr && (
        <span className="shrink-0 text-[10px] text-destructive/70 truncate max-w-[120px]">
          {tool.error}
        </span>
      )}
    </div>
  );
}

/** Derive a list of tool rows for a given agent from raw events.
 *  Pairs `tool_call_started` (inflight) with the corresponding `tool` (done). */
export function deriveToolRows(
  events: Array<{ type: string; [key: string]: any }>,
  agent?: string,
): ToolRowData[] {
  const matches = (e: any) => !agent || !e.agent || e.agent === agent;
  const starts = events.filter((e) => e.type === 'tool_call_started' && matches(e));
  const dones = events.filter((e) => e.type === 'tool' && matches(e));
  const rows: ToolRowData[] = [];
  let i = 0;
  for (const s of starts) {
    const d = dones[i];
    rows.push({
      tool: s.tool || d?.tool || '',
      query: s.query || d?.query || '',
      resultCount: d?.result_count ?? null,
      inflight: !d,
      error: d?.success === false ? (d?.error ?? '失败') : undefined,
    });
    if (d) i += 1;
  }
  while (i < dones.length) {
    const d = dones[i++];
    rows.push({
      tool: d.tool || '',
      query: d.query || '',
      resultCount: d.result_count ?? null,
      inflight: false,
      error: d.success === false ? (d.error ?? '失败') : undefined,
    });
  }
  return rows;
}
