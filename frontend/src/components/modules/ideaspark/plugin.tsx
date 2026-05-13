'use client';

/**
 * IdeaSpark plugin registration.
 *
 * Single-component module — the shell internally picks between STAGE,
 * THEATER and CURTAIN surfaces. No tabs, no external sidebar; history
 * and documents are accessed from inside the Theater (history button in
 * the chat header) and from each surface's composer (paperclip).
 *
 * Stream handlers are owned by useIdeaSparkStream inside the shell, so
 * we don't need to expose `createStreamHandlers` from here. The
 * `reset()` is wired for the shell's "new debate" flow.
 */

import { registerPlugin } from '@/lib/module-loader';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useTaskStore } from '@/stores/task-store';
import { useSessionStore } from '@/stores/session-store';
import IdeaSparkShell from './IdeaSparkShell';

registerPlugin('ideaspark', {
  tabs: [
    {
      id: 'shell',
      label: 'IdeaSpark',
      icon: 'Lightbulb',
      component: IdeaSparkShell,
    },
  ],
  reset: () => {
    useIdeaSparkStore.getState().reset();
    useTaskStore.getState().reset();
    useSessionStore.getState().resetConversation();
  },
});
