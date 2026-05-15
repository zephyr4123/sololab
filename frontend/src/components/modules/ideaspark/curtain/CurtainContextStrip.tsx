'use client';

/**
 * CurtainContextStrip — sits above the IdeaCurtain hero.
 *
 * Two jobs:
 *   1. Tell the user which historical debate this Curtain is showing
 *      (session title + relative completion time).
 *   2. Give two unambiguous escape hatches visible without scrolling:
 *      - "新辩论"   wipes state and falls back to Stage
 *      - "切换历史" opens the SessionDrawer
 *
 * Why this exists: the previous design hid both escape actions at the
 * bottom of CurtainActions. A user landing on a stale Curtain from
 * client-side nav saw the result page with no obvious way out and
 * had to refresh. The strip puts the navigation context where the
 * eye lands first.
 */

import { FolderOpen, Plus } from 'lucide-react';
import { relativeTime } from '@/lib/format';

interface CurtainContextStripProps {
  sessionTitle?: string;
  completedAtMs?: number;
  onNewRound: () => void;
  onOpenDrawer: () => void;
}

export function CurtainContextStrip({
  sessionTitle,
  completedAtMs,
  onNewRound,
  onOpenDrawer,
}: CurtainContextStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border/35 pb-5">
      <div className="flex items-center gap-3 shrink-0">
        <span className="atelier-eyebrow">Result</span>
        <span aria-hidden className="h-px w-5 bg-warm/35" />
        {completedAtMs ? (
          <span
            className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground/55 tabular-nums"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {relativeTime(completedAtMs, { english: true })} · evaluated
          </span>
        ) : (
          <span
            className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground/55"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            evaluated
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {sessionTitle ? (
          <span
            className="block truncate text-[12.5px] tracking-tight text-foreground/65"
            title={sessionTitle}
          >
            {sessionTitle}
          </span>
        ) : (
          <span className="text-[11.5px] italic text-muted-foreground/45">
            未命名会话
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onNewRound}
          className="inline-flex items-center gap-1.5 rounded-full bg-warm/12 px-3.5 py-1.5 text-[11.5px] font-medium text-warm transition-colors hover:bg-warm/20"
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} />
          新一轮
        </button>
        <button
          onClick={onOpenDrawer}
          title="切换历史 (⌘H)"
          className="inline-flex items-center gap-1.5 rounded-full bg-card/50 px-3.5 py-1.5 text-[11.5px] text-muted-foreground/75 transition-colors hover:bg-card hover:text-foreground/90"
        >
          <FolderOpen className="h-3 w-3" strokeWidth={2.2} />
          历史记录
        </button>
      </div>
    </div>
  );
}
