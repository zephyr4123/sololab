'use client';

/**
 * SynthesizeAct — Act III body. A single Connector ⌗ collapses
 * everything into a tighter, deduplicated set. One persona, one lane,
 * full width. Header is owned by the parent ActSlot.
 */

import { AgentLane } from './AgentLane';

interface SynthesizeActProps {
  events: Array<{ type: string; [key: string]: any }>;
}

export function SynthesizeAct({ events }: SynthesizeActProps) {
  return <AgentLane agent="connector" events={events} finalActions={['synthesis']} />;
}
