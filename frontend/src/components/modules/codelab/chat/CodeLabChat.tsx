'use client';

/**
 * CodeLabChat — module entry point + working surface controller.
 *
 * Two surfaces (mirrors IdeaSpark / Writer pattern):
 *
 *   STAGE  (no workingDirectory):
 *     → ProjectStage (workshop hero with recent + browse)
 *
 *   CHAT   (workingDirectory selected):
 *     → CodeLabContextStrip   (top bar — project identity + actions)
 *       ChatEmptyState        (when zero messages)
 *       ChatMessage[]         (interleaved user + assistant)
 *       ChatComposer          (input + skill picker)
 *
 * Streaming is owned here — handlers update the codelab-store, which is
 * read by both ChatMessage and the right-side CodeLabSidebar. Cancel
 * lives here too (AbortController + OpenCode abort RPC).
 *
 * Empty-state pre-fill: when the user clicks a starter card in
 * ChatEmptyState we set `{value, tick}` and pass it to ChatComposer.
 * The tick lets the same prompt be re-picked and still trigger a
 * focus / caret-at-end without remounting.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import type { MessagePart, ParallelTaskGroup } from '@/stores/module-stores/codelab-store';
import { useSessionStore } from '@/stores/session-store';
import { opencode, streamPrompt } from '@/lib/opencode-client';
import type { OpenCodeStreamHandlers } from '@/lib/opencode-client';
import { codelabSessionApi } from '@/lib/api-client';
import { ProjectStage } from '../stage/ProjectStage';
import { PermissionDialog } from '../PermissionDialog';
import { CodeLabContextStrip } from './CodeLabContextStrip';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessage } from './ChatMessage';
import { ChatComposer } from './ChatComposer';

export function CodeLabChat({ moduleId: _moduleId }: { moduleId: string }) {
  const store = useCodeLabStore();
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [prefill, setPrefill] = useState<{ value: string; tick: number } | null>(null);

  // Auto-scroll on message change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [store.messages, store.agentStatus]);

  const send = useCallback(async (text: string) => {
    if (!text || store.isStreaming) return;

    store.addMessage({ id: `usr_${Date.now()}`, role: 'user', content: text, parts: [], timestamp: Date.now() });
    store.addMessage({ id: `ast_${Date.now()}`, role: 'assistant', content: '', parts: [], toolCalls: [], timestamp: Date.now() });
    store.setStreaming(true);
    store.setAgent(store.currentAgent, 'thinking');

    // Create or reuse OpenCode session
    let sid = store.sessionId;
    if (!sid) {
      try {
        const session = await codelabSessionApi.create(store.workingDirectory!);
        sid = session.id;
        store.setSessionId(sid);
        store.bumpSessionList();
        useSessionStore.getState().setCurrentSession(sid);
      } catch (e) {
        store.appendToLastMessage(`\n\n> **错误**: 创建会话失败：${e}`);
        store.setStreaming(false);
        return;
      }
    }

    abortRef.current = new AbortController();

    const handlers: OpenCodeStreamHandlers = {
      onText(delta) {
        store.appendToLastMessage(delta);
        store.setAgent(store.currentAgent, 'writing');
      },
      onAgent(agent, action) {
        store.setAgent(agent, action);
      },
      onToolCall({ tool: toolName, status, title, input: toolInput, output, fileDiff, isNewFile }) {
        store.setAgent(store.currentAgent, 'tool_call');

        const fp = String(toolInput?.filePath || toolInput?.file_path || toolInput?.path || '');
        const hasInput = !!(fp || toolInput?.command || toolInput?.pattern);
        const hasTitle = title !== toolName;

        if (fp) {
          if (['read', 'glob', 'grep', 'list', 'codesearch'].includes(toolName)) {
            store.addFile({ path: fp, language: '', status: 'read' });
          } else if (['edit', 'write', 'multiedit', 'apply_patch'].includes(toolName)) {
            store.addFile({ path: fp, language: '', status: 'modified' });
          }
        }

        const lastMsg = useCodeLabStore.getState().messages.at(-1);
        const match = lastMsg?.toolCalls?.find((tc) => tc.tool === toolName && tc.status === 'running');

        if (match) {
          store.updateToolCallInLastMessage(match.id, {
            status: status as 'pending' | 'running' | 'completed' | 'error',
            title, input: toolInput, output, fileDiff, isNewFile,
          });
        } else if (status === 'running' && !hasInput && !hasTitle) {
          return;
        } else {
          store.addToolCallToLastMessage({
            id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            tool: toolName,
            input: toolInput,
            output,
            status: status as 'pending' | 'running' | 'completed' | 'error',
            title,
            timestamp: Date.now(),
            fileDiff,
            isNewFile,
          });
        }
      },

      onParallelTaskStart(taskId, agent, description) {
        const s = useCodeLabStore.getState();
        const lastMsg = s.messages.at(-1);
        const existingGroup = lastMsg?.parts?.find(
          (p): p is MessagePart & { kind: 'parallel-tasks' } =>
            p.kind === 'parallel-tasks' && p.group.status === 'running'
        );

        if (existingGroup) {
          const updated: ParallelTaskGroup = {
            ...existingGroup.group,
            tasks: [
              ...existingGroup.group.tasks,
              {
                id: taskId, sessionId: taskId, agent, description,
                status: 'running', startTime: Date.now(), toolCalls: [],
              },
            ],
          };
          const msgs = [...s.messages];
          const last = msgs[msgs.length - 1];
          if (last?.role === 'assistant') {
            const parts = (last.parts || []).map((p) =>
              p.kind === 'parallel-tasks' && p.group.id === existingGroup.group.id
                ? { ...p, group: updated }
                : p,
            );
            msgs[msgs.length - 1] = { ...last, parts };
            store.setMessages(msgs);
          }
        } else {
          store.addParallelTaskGroup({
            id: `ptg_${Date.now()}`,
            parentToolCallId: '',
            startTime: Date.now(),
            status: 'running',
            tasks: [{
              id: taskId, sessionId: taskId, agent, description,
              status: 'running', startTime: Date.now(), toolCalls: [],
            }],
          });
        }
      },

      onParallelTaskTool(taskId, tool, status, title, input, output) {
        const s = useCodeLabStore.getState();
        const lastMsg = s.messages.at(-1);
        if (!lastMsg?.parts) return;

        for (const part of lastMsg.parts) {
          if (part.kind !== 'parallel-tasks') continue;
          const task = part.group.tasks.find((t) => t.id === taskId);
          if (!task) continue;

          const existingTc = task.toolCalls.find(
            (tc) => tc.tool === tool && (tc.status === 'running' || tc.status === 'pending'),
          );
          if (existingTc) {
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'assistant') {
              const parts = (last.parts || []).map((p) => {
                if (p.kind !== 'parallel-tasks' || p.group.id !== part.group.id) return p;
                const tasks = p.group.tasks.map((t) => {
                  if (t.id !== taskId) return t;
                  return {
                    ...t,
                    toolCalls: t.toolCalls.map((tc) =>
                      tc.id === existingTc.id
                        ? {
                            ...tc,
                            status: status as 'pending' | 'running' | 'completed' | 'error',
                            output: output || tc.output || '',
                            title: title || tc.title,
                            input: input || tc.input,
                          }
                        : tc,
                    ),
                  };
                });
                return { ...p, group: { ...p.group, tasks } };
              });
              msgs[msgs.length - 1] = { ...last, parts };
              store.setMessages(msgs);
            }
          } else {
            store.addToolCallToParallelTask(part.group.id, taskId, {
              id: `ptc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              tool,
              input: input || {},
              output: output || '',
              status: (status as 'pending' | 'running' | 'completed' | 'error') || 'running',
              title: title || tool,
              timestamp: Date.now(),
            });
          }
          break;
        }
      },

      onParallelTaskDone(taskId, summary, _filesRead, _filesModified, errors, timedOut) {
        const s = useCodeLabStore.getState();
        const lastMsg = s.messages.at(-1);
        if (!lastMsg?.parts) return;

        for (const part of lastMsg.parts) {
          if (part.kind !== 'parallel-tasks') continue;
          const task = part.group.tasks.find((t) => t.id === taskId);
          if (!task) continue;

          const finalStatus = timedOut
            ? 'timeout'
            : errors?.length
              ? 'error'
              : 'completed';
          store.updateParallelTask(part.group.id, taskId, {
            status: finalStatus as 'completed' | 'error' | 'timeout',
            endTime: Date.now(),
            summary: summary || (errors?.length ? errors.join('; ') : ''),
          });

          if (part.group.tasks.every((t) => t.id === taskId || t.status !== 'running')) {
            store.finalizeParallelTaskGroup(part.group.id);
          }
          break;
        }
      },

      onTitleUpdate(_title) { /* sidebar refreshes via sessionListVersion */ },
      onDone(costUsd) {
        store.setStreaming(false);
        store.setAgent(store.currentAgent, 'idle');
        store.finalizeLastMessageToolCalls();
        store.clearToolCalls();
        if (costUsd) store.setCostUsd(store.costUsd + costUsd);
      },
      onError(msg) {
        store.appendToLastMessage(`\n\n> **错误**: ${msg}`);
        store.setStreaming(false);
        store.setAgent(store.currentAgent, 'idle');
      },
    };

    try {
      await streamPrompt(sid, text, store.workingDirectory!, handlers, abortRef.current.signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      handlers.onError(String(e));
    }
  }, [store]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (store.sessionId) opencode.abort(store.sessionId).catch(() => {});
    store.setStreaming(false);
    store.setAgent(store.currentAgent, 'idle');
    store.finalizeLastMessageToolCalls();
  }, [store]);

  const handleSwitchProject = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    store.leaveDirectory();
  }, [store]);

  const handleNewSession = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    useSessionStore.getState().resetConversation();
    store.setMessages([]);
    store.setSessionId(null);
    store.setFiles([]);
    store.clearToolCalls();
  }, [store]);

  const handlePickPrompt = useCallback((p: string) => {
    setPrefill((prev) => ({ value: p, tick: (prev?.tick ?? 0) + 1 }));
  }, []);

  // Gate — no project? show the workshop entry hall.
  if (!store.workingDirectory) {
    return <ProjectStage />;
  }

  const isEmpty = store.messages.length === 0;
  const lastMsg = store.messages[store.messages.length - 1];

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <CodeLabContextStrip
        workingDirectory={store.workingDirectory}
        currentAgent={store.currentAgent}
        agentStatus={store.agentStatus}
        costUsd={store.costUsd}
        hasSession={!!store.sessionId}
        onSwitchProject={handleSwitchProject}
        onNewSession={handleNewSession}
      />

      {store.pendingPermission && (
        <PermissionDialog
          permission={store.pendingPermission}
          onAllow={() => store.setPendingPermission(null)}
          onDeny={() => store.setPendingPermission(null)}
        />
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isEmpty ? (
          <ChatEmptyState onPickPrompt={handlePickPrompt} />
        ) : (
          <div className="mx-auto max-w-[860px] px-6 py-2">
            {store.messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                msg={msg}
                isLast={msg === lastMsg}
                isStreaming={store.isStreaming}
                agentStatus={store.agentStatus}
                currentAgent={store.currentAgent}
              />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-[860px]">
        <ChatComposer
          isStreaming={store.isStreaming}
          agentStatus={store.agentStatus}
          currentAgent={store.currentAgent}
          costUsd={store.costUsd}
          prefill={prefill ?? undefined}
          onSubmit={send}
          onStop={stop}
        />
      </div>
    </div>
  );
}
