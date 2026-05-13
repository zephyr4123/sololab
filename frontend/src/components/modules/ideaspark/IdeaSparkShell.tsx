'use client';

/**
 * IdeaSparkShell — single-component entry that picks one of three
 * surfaces based on observable state:
 *
 *   - STAGE   : the user has not started a debate yet
 *               (no chat entries, no phase activity).
 *   - THEATER : a debate is in progress or has events but no `done`.
 *   - CURTAIN : the latest stream entry has produced `topIdeas`.
 *
 * No Tab UI. The user never picks which surface to view — the system
 * shows the right one for the moment. This mirrors WriterShell's
 * STAGE / SPLIT pattern and removes the chat/board/report tab churn.
 */

import { useCallback, useMemo } from 'react';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useSessionStore } from '@/stores/session-store';
import { IdeaStage } from './stage/IdeaStage';
import { IdeaTheater } from './theater/IdeaTheater';
import { IdeaCurtain } from './curtain/IdeaCurtain';

type Surface = 'stage' | 'theater' | 'curtain';

function deriveSurface({
  chatEntriesCount,
  hasTopIdeas,
  phase,
}: {
  chatEntriesCount: number;
  hasTopIdeas: boolean;
  phase: string;
}): Surface {
  if (chatEntriesCount === 0 && !hasTopIdeas) return 'stage';
  // Done states promote to curtain only if we actually have results.
  if (hasTopIdeas && (phase === 'done' || phase === 'converged')) return 'curtain';
  return 'theater';
}

interface IdeaSparkShellProps {
  moduleId: string;
}

export default function IdeaSparkShell({ moduleId }: IdeaSparkShellProps) {
  const chatEntries = useSessionStore((s) => s.chatEntries);
  const topIdeas = useIdeaSparkStore((s) => s.topIdeas);
  const phase = useIdeaSparkStore((s) => s.phase);

  const surface = useMemo<Surface>(
    () => deriveSurface({
      chatEntriesCount: chatEntries.length,
      hasTopIdeas: topIdeas.length > 0,
      phase,
    }),
    [chatEntries.length, topIdeas.length, phase],
  );

  // "再开一轮" from the Curtain: drop the user back into the Theater so
  // they can type the next prompt without losing context.
  const handleNewRound = useCallback(() => {
    useIdeaSparkStore.getState().setPhase('idle');
  }, []);

  if (surface === 'stage') return <IdeaStage moduleId={moduleId} />;
  if (surface === 'curtain') return <IdeaCurtain moduleId={moduleId} onRequestNewRound={handleNewRound} />;
  return <IdeaTheater moduleId={moduleId} />;
}
