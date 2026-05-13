'use client';

/**
 * useStageDerivation — slices the most recent stream entry's events by
 * phase + round, so the THEATER right pane can render one Act per
 * row, in chronological order.
 *
 * Returns:
 *   - acts: { phase, round, events, state }[]  — ordered, with state
 *     reflecting whether the act is the current one, completed, or
 *     pending (slice exists vs. doesn't).
 *   - currentPhase / currentRound — handy for headers + status pills.
 */

import { useMemo } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { PHASE_ORDER, type PhaseId } from '../../shared/PersonaMeta';
import type { ActState } from '../stage/ActHeader';

export interface DerivedAct {
  phase: PhaseId;
  round: number;
  events: Array<{ type: string; [key: string]: any }>;
  state: ActState;
  key: string;
}

export interface DerivedStage {
  acts: DerivedAct[];
  currentPhase: PhaseId;
  currentRound: number;
  totalRounds: number;
}

export function useStageDerivation(): DerivedStage {
  const chatEntries = useSessionStore((s) => s.chatEntries);

  return useMemo(() => {
    // Use the latest stream entry's events (this is the current debate).
    const lastStream = [...chatEntries].reverse().find((e) => e.kind === 'stream');
    const events = lastStream?.events ?? [];

    // Slice events by status boundaries.
    interface Slice {
      phase: PhaseId;
      round: number;
      events: Array<{ type: string; [key: string]: any }>;
    }
    const slices: Slice[] = [];
    let cur: Slice | null = null;
    let currentPhase: PhaseId = 'separate';
    let currentRound = 1;

    for (const ev of events) {
      if (ev.type === 'status' && ev.phase) {
        if (cur) slices.push(cur);
        currentPhase = ev.phase as PhaseId;
        if (typeof ev.round === 'number') currentRound = ev.round;
        cur = { phase: ev.phase as PhaseId, round: ev.round ?? currentRound, events: [] };
        continue;
      }
      if (cur) cur.events.push(ev);
    }
    if (cur) slices.push(cur);

    // Detect terminal events.
    const isDone = events.some((e) => e.type === 'done');
    const isCancelled = events.some(
      (e) => e.type === 'status' && (e as any).phase === 'cancelled',
    );

    // Build acts for the current round only (process recap shows all rounds).
    const acts: DerivedAct[] = [];
    const phaseIdx = PHASE_ORDER.indexOf(currentPhase);

    for (let i = 0; i < PHASE_ORDER.length; i++) {
      const p = PHASE_ORDER[i];
      const slice = slices.find((s) => s.phase === p && s.round === currentRound);
      let state: ActState;
      if (isDone || isCancelled) state = slice ? 'done' : 'pending';
      else if (slice && i === phaseIdx) state = 'active';
      else state = slice ? 'done' : 'pending';

      acts.push({
        phase: p,
        round: currentRound,
        events: slice?.events ?? [],
        state,
        key: `${p}-${currentRound}`,
      });
    }

    const totalRounds = slices.reduce((m, s) => Math.max(m, s.round), currentRound);
    return { acts, currentPhase, currentRound, totalRounds };
  }, [chatEntries]);
}
