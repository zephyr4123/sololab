'use client';

/**
 * SynthesizeAct — Act III: a single Connector ⌗ collapses everything
 * into a tighter, deduplicated set. One persona, one lane, full width.
 */

import { AgentLane } from './AgentLane';
import { ActHeader, type ActState } from './ActHeader';

interface SynthesizeActProps {
  events: Array<{ type: string; [key: string]: any }>;
  state: ActState;
}

export function SynthesizeAct({ events, state }: SynthesizeActProps) {
  return (
    <section className="space-y-6">
      <ActHeader phase="synthesize" state={state} />
      <AgentLane agent="connector" events={events} finalActions={['synthesis']} />
    </section>
  );
}
