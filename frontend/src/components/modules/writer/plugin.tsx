'use client';

import { registerPlugin } from '@/lib/module-loader';
import { useWriterStore } from '@/stores/module-stores/writer-store';
import { useSessionStore } from '@/stores/session-store';
import { useTaskStore } from '@/stores/task-store';
import WriterChat from './WriterChat';
import KnowledgePanel from './KnowledgePanel';
import OutlineNav from './OutlineNav';

/**
 * WriterAI module plugin registration.
 *
 * Tab layout: single "Write" tab with split view (left chat + right document preview).
 * Sidebar: OutlineNav + KnowledgePanel.
 * Stream handlers: Writer-specific events are handled inside WriterChat via raw event dispatch.
 */

// Sidebar composition
function WriterSidebar() {
  return (
    <div className="space-y-6">
      <OutlineNav />
      <KnowledgePanel />
    </div>
  );
}

registerPlugin('writer', {
  tabs: [
    {
      id: 'write',
      label: 'Write',
      icon: 'PenTool',
      component: WriterChat,
    },
  ],
  sidebar: { component: WriterSidebar },
  reset: () => {
    useWriterStore.getState().reset();
    useTaskStore.getState().reset();
    useSessionStore.getState().resetConversation();
  },
});
