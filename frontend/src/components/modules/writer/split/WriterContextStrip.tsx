'use client';

/**
 * WriterContextStrip — sits above the three-column SPLIT layout.
 *
 * Two jobs (mirrors `IdeaSpark/curtain/CurtainContextStrip`):
 *   1. Tell the user which document they're looking at — title,
 *      phase indicator, relative time since last update.
 *   2. Provide two unambiguous escape hatches without a hunt:
 *      - "新文档"     wipes state and falls back to Stage
 *      - "切换历史"   opens the DocumentDrawer (⌘B)
 *
 * Why this exists: before this strip, the only way to start a new
 * document while inside SPLIT was to open the drawer and click its
 * "新建" button. The user had no top-level signal of which document
 * was loaded, so client-side nav (Home → Writer) silently swapped
 * one historical document for another.
 *
 * The phase chip is intentionally low-key — it's a status indicator
 * (idle / 撰写中 / 已完成), not a primary visual. The user mostly
 * wants to know the document title and how to leave.
 */

import { FolderOpen, Plus } from 'lucide-react';
import { relativeTime } from '@/lib/format';
import type { WriterPhase } from '@/stores/module-stores/writer-store';

interface WriterContextStripProps {
  title?: string;
  phase: WriterPhase;
  updatedAtMs?: number;
  onNewDocument: () => void;
  onOpenDrawer: () => void;
}

const PHASE_LABEL: Record<WriterPhase, { en: string; zh: string }> = {
  idle: { en: 'draft', zh: '草稿' },
  writing: { en: 'drafting', zh: '撰写中' },
  complete: { en: 'complete', zh: '已完成' },
};

export default function WriterContextStrip({
  title,
  phase,
  updatedAtMs,
  onNewDocument,
  onOpenDrawer,
}: WriterContextStripProps) {
  const label = PHASE_LABEL[phase];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/30 px-6 py-3">
      <div className="flex items-center gap-3 shrink-0">
        <span className="atelier-eyebrow">{label.en}</span>
        <span aria-hidden className="h-px w-5 bg-warm/35" />
        {updatedAtMs ? (
          <span
            className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground/55 tabular-nums"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {relativeTime(updatedAtMs, { english: true })} · {label.en === 'draft' ? 'last edit' : label.en}
          </span>
        ) : (
          <span
            className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground/55"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {label.en}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {title ? (
          <span
            className="block truncate text-[12.5px] tracking-tight text-foreground/72"
            title={title}
          >
            {title}
          </span>
        ) : (
          <span className="text-[11.5px] italic text-muted-foreground/45">
            未命名草稿
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onNewDocument}
          className="inline-flex items-center gap-1.5 rounded-full bg-warm/12 px-3.5 py-1.5 text-[11.5px] font-medium text-warm transition-colors hover:bg-warm/20"
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} />
          新文档
        </button>
        <button
          onClick={onOpenDrawer}
          title="切换历史 (⌘B)"
          className="inline-flex items-center gap-1.5 rounded-full bg-card/50 px-3.5 py-1.5 text-[11.5px] text-muted-foreground/75 transition-colors hover:bg-card hover:text-foreground/90"
        >
          <FolderOpen className="h-3 w-3" strokeWidth={2.2} />
          历史记录
        </button>
      </div>
    </div>
  );
}
