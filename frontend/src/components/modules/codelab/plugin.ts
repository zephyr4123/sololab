/**
 * CodeLab module plugin registration.
 *
 * Stream handlers are now handled directly in CodeLabChat.tsx
 * via opencode-client.ts (direct OpenCode connection).
 */

import { registerPlugin } from '@/lib/module-loader';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import { useTaskStore } from '@/stores/task-store';

import { CodeLabChat } from './CodeLabChat';
import { CodeLabSidebar } from './CodeLabSidebar';

registerPlugin('codelab', {
  tabs: [
    { id: 'chat', label: '对话', icon: 'MessageSquare', component: CodeLabChat },
  ],

  sidebar: { component: CodeLabSidebar },

  reset() {
    useCodeLabStore.getState().reset();
    useTaskStore.getState().reset();
  },
});
