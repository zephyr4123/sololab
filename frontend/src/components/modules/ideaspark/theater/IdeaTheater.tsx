'use client';

/**
 * IdeaTheater — running state. Two columns:
 *
 *   ChatColumn (left, 400px)  |  Stage (right, flex-1)
 *
 * The seam between them is a single fading vertical rule, not a hard
 * border. Stage renders 4 acts (Separate / Together / Synthesize /
 * Tournament) stacked vertically. Each act self-renders its body using
 * derived event slices from useStageDerivation.
 *
 * The current round is rendered live; past rounds are not shown here —
 * the Curtain offers a "完整时间线" recap that surfaces them all.
 */

import { useState } from 'react';
import { ChatColumn } from './ChatColumn';
import { SeparateAct } from './stage/SeparateAct';
import { TogetherAct } from './stage/TogetherAct';
import { SynthesizeAct } from './stage/SynthesizeAct';
import { TournamentAct } from './stage/TournamentAct';
import { useStageDerivation } from './hooks/useStageDerivation';
import { ConversationHistory } from '@/components/shared/ConversationHistory';

interface IdeaTheaterProps {
  moduleId: string;
}

export function IdeaTheater({ moduleId }: IdeaTheaterProps) {
  const { acts, currentRound, totalRounds } = useStageDerivation();
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      {/* Atmospheric background — very subtle warm orb */}
      <div
        className="warm-orb"
        style={{ top: '-8%', right: '-4%', width: 540, height: 540, opacity: 0.18 }}
        aria-hidden
      />

      <ChatColumn
        moduleId={moduleId}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((v) => !v)}
      />

      {/* Soft vertical seam between chat & stage — no hard border */}
      <span className="soft-divider-v absolute top-8 bottom-8 left-[400px]" aria-hidden />

      <div className="flex-1 min-w-0 overflow-hidden flex">
        {/* Stage scroll area */}
        <main className="flex-1 min-w-0 overflow-y-auto px-10 py-8 stage-frame">
          <div className="mx-auto w-full max-w-[820px] space-y-12">
            {/* Round badge — only if user is on a follow-up round */}
            {totalRounds > 1 && (
              <div className="flex items-center gap-3">
                <span className="eyebrow-rule" aria-hidden />
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.28em] text-warm/65">
                  Round {currentRound} of {totalRounds}
                </span>
              </div>
            )}

            {acts.map((act) => {
              const props = { events: act.events, state: act.state };
              return (
                <div key={act.key} className="relative">
                  {/* Soft seam below each act except the last — radial fade rather than line */}
                  {act.phase !== 'evaluate' && (
                    <span className="section-seam absolute -bottom-6 left-0 right-0" aria-hidden />
                  )}
                  {act.phase === 'separate' && <SeparateAct {...props} />}
                  {act.phase === 'together' && <TogetherAct {...props} />}
                  {act.phase === 'synthesize' && <SynthesizeAct {...props} />}
                  {act.phase === 'evaluate' && <TournamentAct {...props} />}
                </div>
              );
            })}
          </div>
        </main>

        {/* Side history drawer — slides in from right */}
        {historyOpen && (
          <aside className="w-[280px] shrink-0 overflow-y-auto px-5 py-6 bg-card/40 backdrop-blur-sm animate-slide-in-right relative">
            <span className="soft-divider-v absolute left-0 top-6 bottom-6" aria-hidden />
            <ConversationHistory moduleId={moduleId} />
          </aside>
        )}
      </div>
    </div>
  );
}
