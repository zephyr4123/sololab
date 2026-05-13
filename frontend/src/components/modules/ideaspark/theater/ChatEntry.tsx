'use client';

/**
 * ChatEntry — single row inside the THEATER's left chat column.
 *
 * Two shapes:
 *   - user      : right-aligned warm-tinted bubble.
 *   - stream    : a quiet "moment" — eyebrow describing what happened
 *                  in that turn (e.g. "5 个候选 · 12 次比较 · $0.014").
 *                  The full process lives on the right stage, so this
 *                  column stays minimal.
 */

import { useMemo } from 'react';
import type { ChatEntry as Entry } from '@/stores/session-store';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface ChatEntryProps {
  entry: Entry;
}

export function ChatEntry({ entry }: ChatEntryProps) {
  if (entry.kind === 'user') {
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div
          className="max-w-[88%] rounded-2xl rounded-br-md px-4 py-2.5 text-[13px] leading-relaxed text-foreground/85"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in oklab, var(--color-warm) 14%, transparent), color-mix(in oklab, var(--color-warm) 5%, transparent))',
          }}
        >
          {entry.userText}
        </div>
      </div>
    );
  }
  return <StreamEntryDigest events={entry.events ?? []} />;
}

function StreamEntryDigest({ events }: { events: Array<{ type: string; [key: string]: any }> }) {
  const digest = useMemo(() => {
    const tools = events.filter((e) => e.type === 'tool').length;
    const papers = events
      .filter((e) => e.type === 'tool' && typeof e.result_count === 'number')
      .reduce((s, e) => s + (e.result_count || 0), 0);
    const ideas = events.filter((e) => e.type === 'idea').length;
    const matches = events.filter((e) => e.type === 'evaluate_match').length;
    const doneEv = [...events].reverse().find((e) => e.type === 'done');
    const errEv = [...events].reverse().find((e) => e.type === 'error');
    const topCount = doneEv?.top_ideas?.length ?? 0;
    const cost = doneEv?.cost_usd ?? 0;
    return { tools, papers, ideas, matches, topCount, cost, doneEv, errEv };
  }, [events]);

  if (digest.errEv) {
    return (
      <div className="flex items-start gap-2 px-2 py-2 text-[11.5px] text-destructive/85 animate-fade-in">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        <p className="leading-relaxed">{digest.errEv.message || '运行失败'}</p>
      </div>
    );
  }

  if (!digest.doneEv) {
    return (
      <div className="px-2 py-2 text-[11px] text-muted-foreground/55 italic animate-fade-in">
        辩论正在右侧舞台进行…
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex items-center gap-2 px-2 py-1.5 text-[11px] tabular-nums text-muted-foreground/65">
      <CheckCircle2 className="h-3 w-3 text-warm/65 shrink-0" />
      <span className="text-foreground/75 font-medium">{digest.topCount} 个 Top 创意</span>
      <span className="text-muted-foreground/35">·</span>
      <span>{digest.tools} 搜索</span>
      <span className="text-muted-foreground/35">·</span>
      <span>{digest.papers} 文献</span>
      {digest.cost > 0 && (
        <>
          <span className="text-muted-foreground/35">·</span>
          <span className="text-warm/75">${digest.cost.toFixed(4)}</span>
        </>
      )}
    </div>
  );
}
