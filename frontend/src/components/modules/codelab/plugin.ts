/**
 * CodeLab module plugin registration.
 */

import { registerPlugin } from '@/lib/module-loader';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import { useTaskStore } from '@/stores/task-store';
import type { StreamHandlers } from '@/types/stream';

import { CodeLabChat } from './CodeLabChat';
import { FileExplorer } from './FileExplorer';
import { TerminalPanel } from './TerminalPanel';
import { CodeLabSidebar } from './CodeLabSidebar';

registerPlugin('codelab', {
  tabs: [
    { id: 'chat', label: '对话', icon: 'MessageSquare', component: CodeLabChat },
    { id: 'files', label: '文件', icon: 'FolderOpen', component: FileExplorer },
    { id: 'terminal', label: '终端', icon: 'Terminal', component: TerminalPanel },
  ],

  sidebar: { component: CodeLabSidebar },

  createStreamHandlers(): Partial<StreamHandlers> {
    const store = useCodeLabStore.getState();
    return {
      onText(content) {
        store.appendToLastMessage(content);
        store.setAgent(store.currentAgent, 'writing');
      },
      onAgent(agent, action) {
        if (action === 'thinking' || action === 'start') {
          store.setAgent(agent, 'thinking');
        } else {
          store.setAgent(agent, 'idle');
        }
      },
      onTool(event) {
        store.setAgent(store.currentAgent, 'tool_call');

        // Track file operations
        const input = event as any;
        if (['read', 'glob', 'grep'].includes(event.tool)) {
          const fp = input.file_path || input.path;
          if (fp) store.addFile({ path: fp, language: '', status: 'read' });
        }
        if (['edit', 'write'].includes(event.tool)) {
          const fp = input.file_path || input.filepath;
          if (fp) store.addFile({ path: fp, language: '', status: 'modified' });
        }

        store.addToolCall({
          id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          tool: event.tool,
          input: input,
          status: 'running',
          title: input.file_path || input.command?.slice(0, 60) || event.tool,
          timestamp: Date.now(),
        });
      },
      onDone(_topIdeas, costUsd) {
        store.setStreaming(false);
        store.setAgent(store.currentAgent, 'idle');
        store.clearToolCalls();
        if (costUsd !== undefined) store.setCostUsd(store.costUsd + costUsd);
      },
      onError(msg) {
        store.appendToLastMessage(`\n\n> **Error**: ${msg}`);
        store.setStreaming(false);
        store.setAgent(store.currentAgent, 'idle');
      },
    };
  },

  reset() {
    useCodeLabStore.getState().reset();
    useTaskStore.getState().reset();
  },
});
