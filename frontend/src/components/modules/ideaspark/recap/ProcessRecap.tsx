'use client';

/**
 * ProcessRecap — collapsible full timeline of every Act, every round.
 *
 * Used inline on the Curtain when the user wants to relive the debate.
 * Each round is a sub-section; each Act renders as a compact summary
 * row that expands on click to the full body (same components as the
 * THEATER stage).
 */

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useSessionStore } from '@/stores/session-store';
import { PHASE_ORDER, PHASE_META, type PhaseId } from '../shared/PersonaMeta';
import { SeparateAct } from '../theater/stage/SeparateAct';
import { TogetherAct } from '../theater/stage/TogetherAct';
import { SynthesizeAct } from '../theater/stage/SynthesizeAct';
import { TournamentAct } from '../theater/stage/TournamentAct';

interface Slice {
  phase: PhaseId;
  round: number;
  events: Array<{ type: string; [key: string]: any }>;
}

export function ProcessRecap() {
  const chatEntries = useSessionStore((s) => s.chatEntries);
  const slices = useMemo<Slice[]>(() => {
    const lastStream = [...chatEntries].reverse().find((e) => e.kind === 'stream');
    const events = lastStream?.events ?? [];
    const out: Slice[] = [];
    let cur: Slice | null = null;
    for (const ev of events) {
      if (ev.type === 'status' && (ev as any).phase && PHASE_ORDER.includes((ev as any).phase as PhaseId)) {
        if (cur) out.push(cur);
        cur = { phase: (ev as any).phase as PhaseId, round: (ev as any).round ?? 1, events: [] };
        continue;
      }
      if (cur) cur.events.push(ev as any);
    }
    if (cur) out.push(cur);
    return out;
  }, [chatEntries]);

  const byRound = useMemo(() => {
    const m = new Map<number, Slice[]>();
    for (const s of slices) {
      if (!m.has(s.round)) m.set(s.round, []);
      m.get(s.round)!.push(s);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a - b);
  }, [slices]);

  if (byRound.length === 0) {
    return <p className="text-[11.5px] text-muted-foreground/55">无处理过程记录</p>;
  }

  return (
    <div className="space-y-10 animate-fade-in">
      {byRound.map(([round, list]) => (
        <div key={round} className="space-y-6">
          {byRound.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="eyebrow-rule" aria-hidden />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.28em] text-warm/65">
                Round {round}
              </span>
            </div>
          )}
          {PHASE_ORDER.map((p) => {
            const slice = list.find((s) => s.phase === p);
            if (!slice) return null;
            return <RecapAct key={`${p}-${round}`} slice={slice} />;
          })}
        </div>
      ))}
    </div>
  );
}

function RecapAct({ slice }: { slice: Slice }) {
  const [open, setOpen] = useState(false);
  const tools = slice.events.filter((e) => e.type === 'tool').length;
  const ideas = slice.events.filter((e) => e.type === 'idea').length;
  const matches = slice.events.filter((e) => e.type === 'evaluate_match').length;
  const meta = PHASE_META[slice.phase];

  let summary = '';
  if (slice.phase === 'separate') summary = `${ideas} 个创意 · ${tools} 次检索`;
  else if (slice.phase === 'together') {
    const iters = new Set(slice.events.filter((e) => typeof e.iteration === 'number').map((e) => e.iteration)).size;
    summary = `${iters} 轮辩论 · ${tools} 次检索`;
  } else if (slice.phase === 'synthesize') summary = `${tools} 次检索 · 全局整合`;
  else if (slice.phase === 'evaluate') summary = `${matches} 次比较`;

  return (
    <div className="rounded-xl bg-card/40 backdrop-blur-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="group w-full flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-card/65 rounded-xl"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-muted-foreground/45 transition-transform duration-200 ${open ? 'rotate-90 text-warm/65' : ''}`}
        />
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/55">
          {meta?.caps}
        </span>
        <span className="text-[12px] text-foreground/75 tracking-tight">{meta?.zh}</span>
        <span className="ml-auto text-[11px] text-muted-foreground/55 tabular-nums">{summary}</span>
      </button>
      {open && (
        <div className="px-5 pb-6 pt-2 animate-fade-in">
          {slice.phase === 'separate' && <SeparateAct events={slice.events} />}
          {slice.phase === 'together' && <TogetherAct events={slice.events} />}
          {slice.phase === 'synthesize' && <SynthesizeAct events={slice.events} />}
          {slice.phase === 'evaluate' && <TournamentAct events={slice.events} />}
        </div>
      )}
    </div>
  );
}
