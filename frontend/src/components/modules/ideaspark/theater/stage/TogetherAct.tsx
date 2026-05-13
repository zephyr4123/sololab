'use client';

/**
 * TogetherAct — Act II body. Critic ⌁ and Connector ⌗ debate, one
 * iteration at a time. Each iteration renders as a stacked pair of
 * lanes; the separator between iterations is just spacing + a tiny
 * eyebrow rule.
 *
 * Header is owned by the parent ActSlot.
 */

import { useMemo } from 'react';
import { AgentLane } from './AgentLane';

interface TogetherActProps {
  events: Array<{ type: string; [key: string]: any }>;
}

export function TogetherAct({ events }: TogetherActProps) {
  const iterations = useMemo(() => {
    const map = new Map<number, Array<{ type: string; [key: string]: any }>>();
    for (const e of events) {
      const it = typeof e.iteration === 'number' ? e.iteration : null;
      if (it === null) continue;
      if (!map.has(it)) map.set(it, []);
      map.get(it)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [events]);

  if (iterations.length === 0) {
    return (
      <p className="text-[11.5px] text-muted-foreground/45 italic pl-1">协同评议即将开始…</p>
    );
  }

  return (
    <div className="space-y-7">
      {iterations.map(([iter, iterEvents], i) => (
        <div key={iter} className="space-y-5">
          {iterations.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="eyebrow-rule shrink-0" aria-hidden />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/45">
                Round {i + 1} of {iterations.length}
              </span>
            </div>
          )}
          <AgentLane agent="critic" events={iterEvents} finalActions={['critique']} />
          <AgentLane agent="connector" events={iterEvents} finalActions={['synthesis']} />
        </div>
      ))}
    </div>
  );
}
