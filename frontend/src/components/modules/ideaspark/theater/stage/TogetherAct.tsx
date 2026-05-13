'use client';

/**
 * TogetherAct — Act II: Critic ⌁ and Connector ⌗ debate, one iteration
 * at a time. Each iteration renders as a stacked pair of lanes; the
 * separator between iterations is just spacing + a tiny eyebrow rule.
 */

import { useMemo } from 'react';
import { AgentLane } from './AgentLane';
import { ActHeader, type ActState } from './ActHeader';

interface TogetherActProps {
  events: Array<{ type: string; [key: string]: any }>;
  state: ActState;
}

export function TogetherAct({ events, state }: TogetherActProps) {
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

  return (
    <section className="space-y-6">
      <ActHeader
        phase="together"
        state={state}
        meta={iterations.length ? <span>{iterations.length} 轮辩论</span> : null}
      />

      {iterations.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground/45 italic pl-1">协同评议即将开始…</p>
      ) : (
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
      )}
    </section>
  );
}
