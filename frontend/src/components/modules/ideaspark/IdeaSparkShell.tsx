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
 *
 * Shell also owns the SessionDrawer state and ⌘H global hotkey so all
 * three surfaces can open the same drawer.
 *
 * Mount-time freshness:
 *   The ideaspark store is a singleton in memory — client-side nav from
 *   Home back into this module does NOT unmount it, so a finished debate
 *   (phase='done' + topIdeas) sits there until something clears it. We
 *   detect that "stale Curtain" on mount and reset, so the user always
 *   lands on a clean Stage unless they explicitly open a session from
 *   the Drawer. Theater mid-stream is preserved (phase still 'separate'
 *   etc.), so context-switching mid-debate doesn't lose work.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useSessionStore } from '@/stores/session-store';
import { IdeaStage } from './stage/IdeaStage';
import { IdeaTheater } from './theater/IdeaTheater';
import { IdeaCurtain } from './curtain/IdeaCurtain';
import SessionDrawer from './sessions/SessionDrawer';

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

  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Stale-Curtain detection — see header comment. Runs once per mount.
  // If we land here with a finished debate's state still in the store,
  // wipe it so the user sees Stage. Active streams (separate / cluster
  // / together / synthesize / evaluate) are left alone.
  useEffect(() => {
    const s = useIdeaSparkStore.getState();
    const isStaleCurtain =
      (s.phase === 'done' || s.phase === 'converged') && s.topIdeas.length > 0;
    if (isStaleCurtain) {
      useSessionStore.getState().resetConversation();
    }
  }, []);

  // Global ⌘H / Ctrl+H — toggle the session drawer from any surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setDrawerOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // "New debate" — full reset to Stage. The previous version only set
  // phase='idle' but kept topIdeas, which made deriveSurface fall into
  // Theater instead of Stage. resetConversation() clears chat entries,
  // ideaspark store, and task store in one call.
  const handleNewRound = useCallback(() => {
    useSessionStore.getState().resetConversation();
  }, []);

  return (
    <>
      {surface === 'stage' && <IdeaStage moduleId={moduleId} onOpenDrawer={openDrawer} />}
      {surface === 'theater' && <IdeaTheater moduleId={moduleId} onOpenDrawer={openDrawer} />}
      {surface === 'curtain' && (
        <IdeaCurtain
          moduleId={moduleId}
          onRequestNewRound={handleNewRound}
          onOpenDrawer={openDrawer}
        />
      )}
      <SessionDrawer moduleId={moduleId} open={drawerOpen} onClose={closeDrawer} />
    </>
  );
}
