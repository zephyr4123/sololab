'use client';

/**
 * IdeaTheater — running state. Two columns:
 *
 *   ChatColumn (left, 400px)  |  Stage (right, flex-1)
 *
 * The seam between them is a single fading vertical rule, not a hard
 * border. The right stage renders 4 acts (Separate / Together /
 * Synthesize / Tournament) as an accordion: the currently-active act
 * occupies a bounded internal-scroll region so all four acts stay
 * visible on one screen; completed acts collapse to a single eyebrow
 * row that can be re-expanded; pending acts read as "待启动".
 *
 * Past rounds aren't shown — the Curtain offers a "完整时间线" recap
 * that surfaces them all.
 */

import { ReactNode } from 'react';
import { ChatColumn } from './ChatColumn';
import { SeparateAct } from './stage/SeparateAct';
import { TogetherAct } from './stage/TogetherAct';
import { SynthesizeAct } from './stage/SynthesizeAct';
import { TournamentAct } from './stage/TournamentAct';
import { ActSlot } from './stage/ActSlot';
import { useStageDerivation, type DerivedAct } from './hooks/useStageDerivation';

interface IdeaTheaterProps {
  moduleId: string;
  onOpenDrawer: () => void;
}

function getActMeta(act: DerivedAct): ReactNode {
  if (act.events.length === 0) return null;
  switch (act.phase) {
    case 'separate': {
      const ideas = act.events.filter((e) => e.type === 'idea').length;
      return ideas ? <span>{ideas} 创意</span> : null;
    }
    case 'together': {
      const iters = new Set(
        act.events
          .map((e) => (typeof e.iteration === 'number' ? e.iteration : null))
          .filter((it): it is number => it !== null),
      );
      return iters.size ? <span>{iters.size} 轮</span> : null;
    }
    case 'synthesize':
      return null;
    case 'evaluate': {
      const matches = act.events.filter((e) => e.type === 'evaluate_match').length;
      const candidates = new Set<string>();
      for (const e of act.events) {
        if (e.type === 'evaluate_match') {
          if (e.a_id) candidates.add(e.a_id);
          if (e.b_id) candidates.add(e.b_id);
        } else if (e.type === 'vote' && e.idea_id) {
          candidates.add(e.idea_id);
        }
      }
      return matches ? (
        <span>
          {matches} 次比较 · {candidates.size} 候选
        </span>
      ) : null;
    }
    default:
      return null;
  }
}

export function IdeaTheater({ moduleId, onOpenDrawer }: IdeaTheaterProps) {
  const { acts, currentRound, totalRounds } = useStageDerivation();

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      <div
        className="warm-orb"
        style={{ top: '-8%', right: '-4%', width: 540, height: 540, opacity: 0.18 }}
        aria-hidden
      />

      <ChatColumn moduleId={moduleId} onOpenDrawer={onOpenDrawer} />

      <span className="soft-divider-v absolute top-8 bottom-8 left-[400px]" aria-hidden />

      <div className="flex-1 min-w-0 overflow-hidden flex">
        <main className="flex-1 min-w-0 overflow-y-auto px-10 py-8 stage-frame">
          <div className="mx-auto w-full max-w-[820px] space-y-7">
            {totalRounds > 1 && (
              <div className="flex items-center gap-3">
                <span className="eyebrow-rule" aria-hidden />
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.28em] text-warm/65">
                  Round {currentRound} of {totalRounds}
                </span>
              </div>
            )}

            {acts.map((act) => (
              <ActSlot
                key={act.key}
                phase={act.phase}
                state={act.state}
                meta={getActMeta(act)}
              >
                {act.phase === 'separate' && <SeparateAct events={act.events} />}
                {act.phase === 'together' && <TogetherAct events={act.events} />}
                {act.phase === 'synthesize' && <SynthesizeAct events={act.events} />}
                {act.phase === 'evaluate' && <TournamentAct events={act.events} />}
              </ActSlot>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
