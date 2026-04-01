'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, Bot, User, FolderOpen, ArrowLeft } from 'lucide-react';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import type { MessagePart, ParallelTaskGroup } from '@/stores/module-stores/codelab-store';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';
import { ToolCallCard } from './ToolCallCard';
import { ParallelTaskView } from './ParallelTaskView';
import { PermissionDialog } from './PermissionDialog';
import { ProjectSelector } from './ProjectSelector';
import { opencode, streamPrompt } from '@/lib/opencode-client';
import type { OpenCodeStreamHandlers } from '@/lib/opencode-client';
import { useSessionStore } from '@/stores/session-store';

/* ── Quirky Thinking Indicator ── */

const THINKING_WORDS = [
  'Thinking', 'Reasoning', 'Brewing', 'Pondering',
  'Crafting', 'Weaving', 'Connecting', 'Synthesizing',
  'Contemplating', 'Distilling', 'Architecting',
];

function ThinkingIndicator() {
  const [word] = useState(() =>
    THINKING_WORDS[Math.floor(Math.random() * THINKING_WORDS.length)]
  );

  return (
    <div className="flex items-center gap-1.5 py-2 select-none animate-fade-in">
      <span
        className="text-[13px] text-muted-foreground/40 italic tracking-wide"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {word}
      </span>
      <span className="flex items-center gap-[3px]">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="thinking-dot h-[5px] w-[5px] rounded-full"
            style={{
              animationDelay: `${delay}ms`,
              backgroundColor: 'var(--color-warm)',
              opacity: 0.5,
            }}
          />
        ))}
      </span>
    </div>
  );
}

/* ── Main Chat Component ── */

export function CodeLabChat({ moduleId }: { moduleId: string }) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const store = useCodeLabStore();

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [store.messages, store.agentStatus]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || store.isStreaming) return;
    setInput('');

    store.addMessage({ id: `usr_${Date.now()}`, role: 'user', content: text, parts: [], timestamp: Date.now() });
    store.addMessage({ id: `ast_${Date.now()}`, role: 'assistant', content: '', parts: [], toolCalls: [], timestamp: Date.now() });
    store.setStreaming(true);
    store.setAgent(store.currentAgent, 'thinking');

    // Create or reuse OpenCode session
    let sid = store.sessionId;
    if (!sid) {
      try {
        const session = await opencode.createSession(store.workingDirectory!);
        sid = session.id;
        store.setSessionId(sid);
        useSessionStore.getState().setCurrentSession(sid);
      } catch (e) {
        store.appendToLastMessage(`\n\n> **Error**: Failed to create session: ${e}`);
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

        const fp = (toolInput?.filePath || toolInput?.file_path || toolInput?.path || '') as string;
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
          store.updateToolCallInLastMessage(match.id, { status: status as any, title, input: toolInput, output, fileDiff, isNewFile });
        } else if (status === 'running' && !hasInput && !hasTitle) {
          return;
        } else {
          store.addToolCallToLastMessage({
            id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            tool: toolName, input: toolInput, output, status: status as any,
            title, timestamp: Date.now(), fileDiff, isNewFile,
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
            tasks: [...existingGroup.group.tasks, {
              id: taskId, sessionId: taskId, agent, description,
              status: 'running', startTime: Date.now(), toolCalls: [],
            }],
          };
          const msgs = [...s.messages];
          const last = msgs[msgs.length - 1];
          if (last?.role === 'assistant') {
            const parts = (last.parts || []).map((p) =>
              p.kind === 'parallel-tasks' && p.group.id === existingGroup.group.id ? { ...p, group: updated } : p
            );
            msgs[msgs.length - 1] = { ...last, parts };
            store.setMessages(msgs);
          }
        } else {
          store.addParallelTaskGroup({
            id: `ptg_${Date.now()}`, parentToolCallId: '', startTime: Date.now(), status: 'running',
            tasks: [{ id: taskId, sessionId: taskId, agent, description, status: 'running', startTime: Date.now(), toolCalls: [] }],
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

          const existingTc = task.toolCalls.find((tc) => tc.tool === tool && (tc.status === 'running' || tc.status === 'pending'));
          if (existingTc) {
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'assistant') {
              const parts = (last.parts || []).map((p) => {
                if (p.kind !== 'parallel-tasks' || p.group.id !== part.group.id) return p;
                const tasks = p.group.tasks.map((t) => {
                  if (t.id !== taskId) return t;
                  return { ...t, toolCalls: t.toolCalls.map((tc) =>
                    tc.id === existingTc.id ? { ...tc, status: status as any, output: output || tc.output || '', title: title || tc.title, input: input || tc.input } : tc
                  )};
                });
                return { ...p, group: { ...p.group, tasks } };
              });
              msgs[msgs.length - 1] = { ...last, parts };
              store.setMessages(msgs);
            }
          } else {
            store.addToolCallToParallelTask(part.group.id, taskId, {
              id: `ptc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              tool, input: input || {}, output: output || '', status: (status as any) || 'running', title: title || tool, timestamp: Date.now(),
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

          const finalStatus = timedOut ? 'timeout' : (errors?.length ? 'error' : 'completed');
          store.updateParallelTask(part.group.id, taskId, {
            status: finalStatus as any, endTime: Date.now(),
            summary: summary || (errors?.length ? errors.join('; ') : ''),
          });

          if (part.group.tasks.every((t) => t.id === taskId || t.status !== 'running')) {
            store.finalizeParallelTaskGroup(part.group.id);
          }
          break;
        }
      },

      onTitleUpdate(title) {
        // Session title updated — could refresh sidebar
        void title;
      },
      onDone(costUsd) {
        store.setStreaming(false);
        store.setAgent(store.currentAgent, 'idle');
        store.finalizeLastMessageToolCalls();
        store.clearToolCalls();
        if (costUsd) store.setCostUsd(store.costUsd + costUsd);
      },
      onError(msg) {
        store.appendToLastMessage(`\n\n> **Error**: ${msg}`);
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
  }, [input, store, moduleId]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (store.sessionId) opencode.abort(store.sessionId).catch(() => {});
    store.setStreaming(false);
    store.setAgent(store.currentAgent, 'idle');
    store.finalizeLastMessageToolCalls();
  }, [store]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Gate: must select a project directory first (placed after all hooks)
  if (!store.workingDirectory) {
    return <ProjectSelector />;
  }

  const lastMsg = store.messages[store.messages.length - 1];

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Directory header */}
      <div className="shrink-0 flex items-center gap-2 mb-3 px-1">
        <button
          onClick={() => store.leaveDirectory()}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground hover:bg-foreground/[0.04]"
          title="Switch project"
        >
          <ArrowLeft className="h-3 w-3" />
        </button>
        <FolderOpen className="h-3.5 w-3.5 text-[var(--color-warm)]" />
        <span className="font-mono text-xs text-muted-foreground truncate">
          {store.workingDirectory}
        </span>
      </div>

      {/* Permission dialog */}
      {store.pendingPermission && (
        <PermissionDialog
          permission={store.pendingPermission}
          onAllow={() => store.setPendingPermission(null)}
          onDeny={() => store.setPendingPermission(null)}
        />
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-2 pb-4">
        {store.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
            <div className="w-16 h-16 rounded-2xl bg-card border border-border/50 flex items-center justify-center mb-4">
              <Bot className="w-7 h-7 text-[var(--color-warm)]" />
            </div>
            <h3 className="text-lg font-medium mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              CodeLab
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              AI 编码助手。描述你的需求，我来帮你探索、规划和实现。
            </p>
          </div>
        )}

        {store.messages.map((msg) => (
          <div key={msg.id} className="animate-fade-in-up">
            {msg.role === 'user' ? (
              /* ── User message ── */
              <div className="flex gap-3 py-3 pl-1">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.07]">
                  <User className="h-3.5 w-3.5 text-foreground/70" />
                </div>
                <div className="flex-1 pt-0.5 text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            ) : (
              /* ── Assistant message ── */
              <div className="flex gap-3 py-3 pl-1">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-warm)]/10">
                  <Bot className="h-3.5 w-3.5 text-[var(--color-warm)]" />
                </div>
                <div className="flex-1 min-w-0">
                  {/* Thinking indicator — quirky verb + bouncing dots */}
                  {store.isStreaming && msg === lastMsg && store.agentStatus === 'thinking' && (
                    <ThinkingIndicator />
                  )}

                  {/* Interleaved parts — text and tools in SSE order */}
                  {msg.parts && msg.parts.length > 0 ? (
                    msg.parts.map((part, i) =>
                      part.kind === 'text' ? (
                        <div key={`t${i}`} className="text-sm prose prose-sm max-w-none py-0.5">
                          <MarkdownViewer content={part.content} compact />
                        </div>
                      ) : part.kind === 'parallel-tasks' ? (
                        <ParallelTaskView key={`pt${i}`} group={part.group} />
                      ) : (
                        <ToolCallCard key={part.toolCall.id} toolCall={part.toolCall} />
                      )
                    )
                  ) : (
                    /* Fallback for messages without parts (e.g., loaded from history) */
                    <>
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="my-1">
                          {msg.toolCalls.map((tc) => (
                            <ToolCallCard key={tc.id} toolCall={tc} />
                          ))}
                        </div>
                      )}
                      {msg.content && (
                        <div className="text-sm prose prose-sm max-w-none">
                          <MarkdownViewer content={msg.content} compact />
                        </div>
                      )}
                    </>
                  )}

                  {/* Streaming cursor */}
                  {store.isStreaming && msg === lastMsg && (
                    <span className="inline-block w-[2px] h-4 bg-[var(--color-warm)]/70 animate-pulse rounded-full ml-0.5 align-text-bottom" />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        <div ref={endRef} />
      </div>

      {/* Input area — unified container */}
      <div className="shrink-0 pt-3 pb-1 px-1">
        <div className="rounded-2xl border border-border/50 bg-card/50 transition-all duration-200 focus-within:border-[var(--color-warm)]/30 focus-within:bg-card/80 focus-within:shadow-[0_0_0_1px_var(--color-warm)]/10">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你的编码需求..."
            rows={1}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/35"
            disabled={store.isStreaming}
          />

          {/* Bottom bar — status left, button right */}
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="text-[11px] text-muted-foreground/40">
              {store.isStreaming && (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warm)] animate-pulse" />
                  {store.agentStatus === 'thinking' && '思考中...'}
                  {store.agentStatus === 'tool_call' && '调用工具...'}
                  {store.agentStatus === 'writing' && '生成中...'}
                </span>
              )}
              {!store.isStreaming && store.costUsd > 0 && (
                <span>${store.costUsd.toFixed(4)}</span>
              )}
            </div>

            {store.isStreaming ? (
              <button
                onClick={stop}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
                title="Stop"
              >
                <Square className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-warm)]/15 text-[var(--color-warm)] transition-all hover:bg-[var(--color-warm)]/25 disabled:opacity-20"
                title="Send (Enter)"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
