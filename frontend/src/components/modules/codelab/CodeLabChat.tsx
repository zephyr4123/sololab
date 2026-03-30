'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, Bot, User, Wrench, ChevronDown, ChevronRight, FolderOpen, ArrowLeft } from 'lucide-react';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';
import { AgentBadge } from './AgentBadge';
import { ToolCallCard } from './ToolCallCard';
import { PermissionDialog } from './PermissionDialog';
import { ProjectSelector } from './ProjectSelector';
import { ResilientSSEClient } from '@/lib/sse-client';
import { useSessionStore } from '@/stores/session-store';

const sseClient = new ResilientSSEClient();

export function CodeLabChat({ moduleId }: { moduleId: string }) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const store = useCodeLabStore();

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [store.messages, store.activeToolCalls, store.agentStatus]);

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

    // Add user message
    store.addMessage({
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });

    // Add empty assistant message
    store.addMessage({
      id: `ast_${Date.now()}`,
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: Date.now(),
    });

    store.setStreaming(true);
    store.setAgent(store.currentAgent, 'thinking');

    const session = useSessionStore.getState();

    await sseClient.start(moduleId, text, { directory: store.workingDirectory, session_id: store.sessionId ?? undefined }, {
      onTaskCreated(sessionId) {
        if (sessionId) {
          store.setSessionId(sessionId);
          session.setCurrentSession(sessionId);
        }
      },
      onText(content) {
        store.appendToLastMessage(content);
        store.setAgent(store.currentAgent, 'writing');
      },
      onAgent(agent, action) {
        if (action === 'thinking' || action === 'start') {
          store.setAgent(agent, 'thinking');
        } else if (action === 'done' || action === 'complete') {
          store.setAgent(agent, 'idle');
        }
      },
      onTool(event) {
        const tool = event.tool;
        store.setAgent(store.currentAgent, 'tool_call');
        store.addToolCall({
          id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          tool,
          input: event as any,
          status: 'running',
          title: tool,
          timestamp: Date.now(),
        });
      },
      onStatus(phase) {
        if (phase === 'permission_request') {
          store.setPendingPermission({
            id: `perm_${Date.now()}`,
            tool: 'unknown',
            description: 'Permission required',
            status: 'pending',
          });
        }
      },
      onDone(_topIdeas, costUsd) {
        store.setStreaming(false);
        store.setAgent(store.currentAgent, 'idle');
        store.clearToolCalls();
        if (costUsd !== undefined) store.setCostUsd(store.costUsd + costUsd);
        session.fetchSessions(moduleId);
      },
      onError(msg) {
        store.appendToLastMessage(`\n\n> **Error**: ${msg}`);
        store.setStreaming(false);
        store.setAgent(store.currentAgent, 'idle');
      },
    }, store.sessionId ?? undefined);
  }, [input, store, moduleId]);

  const stop = useCallback(() => {
    sseClient.stop();
    store.setStreaming(false);
    store.setAgent(store.currentAgent, 'idle');
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
              <div className="flex gap-3 py-3 pl-1">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.07]">
                  <User className="h-3.5 w-3.5 text-foreground/70" />
                </div>
                <div className="flex-1 pt-0.5 text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="flex gap-3 py-3 pl-1">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-warm)]/10">
                  <Bot className="h-3.5 w-3.5 text-[var(--color-warm)]" />
                </div>
                <div className="flex-1 min-w-0">
                  {/* Agent badge */}
                  <AgentBadge agent={store.currentAgent} status={store.agentStatus} />

                  {/* Tool calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.toolCalls.map((tc) => (
                        <ToolCallCard key={tc.id} toolCall={tc} />
                      ))}
                    </div>
                  )}

                  {/* Text content */}
                  {msg.content && (
                    <div className="mt-1.5 text-sm prose prose-sm max-w-none">
                      <MarkdownViewer content={msg.content} compact />
                    </div>
                  )}

                  {/* Streaming cursor */}
                  {store.isStreaming && msg === store.messages[store.messages.length - 1] && (
                    <span className="inline-block w-1.5 h-4 bg-[var(--color-warm)] animate-pulse rounded-sm ml-0.5 align-text-bottom" />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Active tool calls during streaming */}
        {store.isStreaming && store.activeToolCalls.length > 0 && (
          <div className="pl-10 space-y-1.5 animate-fade-in">
            {store.activeToolCalls.filter((tc) => tc.status === 'running').map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border/40 pt-3 pb-1">
        <div className="relative flex items-end gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 transition-colors focus-within:border-[var(--color-warm)]/40 focus-within:bg-card">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你的编码需求..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/40"
            disabled={store.isStreaming}
          />

          {store.isStreaming ? (
            <button
              onClick={stop}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
              title="Stop"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!input.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-warm)]/10 text-[var(--color-warm)] transition-all hover:bg-[var(--color-warm)]/20 disabled:opacity-30 disabled:hover:bg-transparent"
              title="Send"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status bar */}
        {(store.isStreaming || store.costUsd > 0) && (
          <div className="mt-1.5 flex items-center gap-3 px-1 text-[11px] text-muted-foreground/50">
            {store.isStreaming && (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warm)] animate-pulse" />
                {store.agentStatus === 'thinking' && '思考中...'}
                {store.agentStatus === 'tool_call' && '调用工具...'}
                {store.agentStatus === 'writing' && '生成中...'}
              </span>
            )}
            {store.costUsd > 0 && <span>${store.costUsd.toFixed(4)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
