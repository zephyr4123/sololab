/**
 * CodeLab module plugin registration.
 *
 * After the workshop redesign the module organises into:
 *   chat/     — entry CodeLabChat (also gates the ProjectStage) + composer + context strip
 *   stage/    — ProjectStage (no-directory entry hall)
 *   sidebar/  — ProjectTile + SessionList + ChangesList + CostPill
 *   tools/    — ToolCallCard + diff viewers
 *   fork/     — ForkDiagram + ForkSpoke (parallel agent visualisation)
 *   shared/   — AgentMeta + ToolMeta (single source of truth)
 *
 * Stream handlers live in chat/CodeLabChat.tsx (direct OpenCode
 * connection via opencode-client). The plugin contract only wires the
 * top-level components into the host shell.
 */

import { registerPlugin } from '@/lib/module-loader';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import { useTaskStore } from '@/stores/task-store';

import { CodeLabChat } from './chat/CodeLabChat';
import { CodeLabSidebar } from './sidebar/CodeLabSidebar';

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
