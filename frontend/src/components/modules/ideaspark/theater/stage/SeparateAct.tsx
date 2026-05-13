'use client';

/**
 * SeparateAct — Act I body. Two minds (Divergent ✦ + Expert ◇) work in
 * parallel. Each persona occupies a column; columns are separated by a
 * faint vertical fade rule rather than a hard border.
 *
 * The header (eyebrow + roman numeral + status) is owned by the parent
 * ActSlot, so this component is body-only.  AgentLane now consumes the
 * `type: 'idea'` event directly, so we no longer render a second
 * IdeaCard underneath — the lane *is* the card.
 */

import { AgentLane } from './AgentLane';

interface SeparateActProps {
  events: Array<{ type: string; [key: string]: any }>;
}

const PERSONAS_IN_ACT = ['divergent', 'expert'] as const;

export function SeparateAct({ events }: SeparateActProps) {
  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6">
      <span
        aria-hidden
        className="soft-divider-v hidden lg:block absolute top-2 bottom-2 left-1/2 -translate-x-1/2"
      />
      {PERSONAS_IN_ACT.map((agent) => (
        <AgentLane key={agent} agent={agent} events={events} finalActions={['idea']} />
      ))}
    </div>
  );
}
