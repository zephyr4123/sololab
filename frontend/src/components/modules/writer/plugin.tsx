'use client';

import { registerPlugin } from '@/lib/module-loader';
import { useWriterStore } from '@/stores/module-stores/writer-store';
import { useSessionStore } from '@/stores/session-store';
import { useTaskStore } from '@/stores/task-store';
import WriterChat from './WriterChat';

registerPlugin('writer', {
  tabs: [
    {
      id: 'write',
      label: '写作',
      icon: 'PenTool',
      component: WriterChat,
    },
  ],
  reset: () => {
    useWriterStore.getState().reset();
    useTaskStore.getState().reset();
    useSessionStore.getState().resetConversation();
  },
});
