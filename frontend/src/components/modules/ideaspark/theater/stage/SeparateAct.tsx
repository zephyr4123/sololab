'use client';

/**
 * SeparateAct — Act I: two minds (Divergent ✦ + Expert ◇) work in
 * parallel. Each persona occupies a column; columns are separated by a
 * faint vertical fade rule rather than a hard border.
 *
 * Produced ideas float in beneath both columns once they emerge.
 */

import { useMemo } from 'react';
import { AgentLane } from './AgentLane';
import { IdeaCard } from './IdeaCard';
import { ActHeader, type ActState } from './ActHeader';

interface SeparateActProps {
  events: Array<{ type: string; [key: string]: any }>;
  state: ActState;
}

const PERSONAS_IN_ACT = ['divergent', 'expert'] as const;

export function SeparateAct({ events, state }: SeparateActProps) {
  const ideas = useMemo(() => events.filter((e) => e.type === 'idea'), [events]);

  return (
    <section className="space-y-6">
      <ActHeader phase="separate" state={state} meta={ideas.length ? <span>{ideas.length} 创意已产出</span> : null} />

      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6">
        {/* Soft vertical seam — only on lg+, fades both ends */}
        <span
          aria-hidden
          className="soft-divider-v hidden lg:block absolute top-2 bottom-2 left-1/2 -translate-x-1/2"
        />
        {PERSONAS_IN_ACT.map((agent) => (
          <AgentLane key={agent} agent={agent} events={events} finalActions={['idea']} />
        ))}
      </div>

      {ideas.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 mt-2">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} author={idea.author} content={idea.content} />
          ))}
        </div>
      )}
    </section>
  );
}
