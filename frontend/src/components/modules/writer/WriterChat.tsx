'use client';

import { useCallback, useRef, useState } from 'react';
import { useWriterStore } from '@/stores/module-stores/writer-store';
import { useSessionStore } from '@/stores/session-store';
import { useTaskStore } from '@/stores/task-store';
import { ResilientSSEClient } from '@/lib/sse-client';
import type { StreamHandlers } from '@/types/stream';
import DocumentPreview from './DocumentPreview';

const MODULE_ID = 'writer';

export default function WriterChat({ moduleId }: { moduleId: string }) {
  const [input, setInput] = useState('');
  const sseRef = useRef<ResilientSSEClient | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const store = useWriterStore();
  const sessionStore = useSessionStore();
  const taskStore = useTaskStore();

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || store.isStreaming) return;

    // Add user message to chat
    store.addChatEntry({
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });
    setInput('');

    store.setIsStreaming(true);

    // Build stream handlers (matching StreamHandlers signatures)
    const handlers: StreamHandlers = {
      onTaskCreated: (sessionId) => {
        if (sessionId) sessionStore.setCurrentSession(sessionId);
      },
      onStatus: (phase) => {
        if (phase === 'cancelled') store.setIsStreaming(false);
      },
      onAgent: (_agent, action, content) => {
        store.setAgentStatus({ action, content });
        if (action === 'done' && content) {
          store.addChatEntry({ id: `agent-${Date.now()}`, role: 'assistant', content, timestamp: Date.now() });
        }
      },
      onTool: (e) => {
        if (e.status === 'running') store.setAgentStatus({ action: `Using ${e.tool}...` });
        if (e.status === 'complete' || e.status === 'error') {
          store.addChatEntry({
            id: `tool-${Date.now()}-${e.tool}`,
            role: 'tool',
            content: e.status === 'error' ? `${e.tool}: Error` : `${e.tool}: Done`,
            timestamp: Date.now(),
            toolName: e.tool,
            toolStatus: e.status,
          });
        }
      },
      onDone: (_topIdeas, costUsd) => {
        store.setIsStreaming(false);
        store.setAgentStatus(null);
        if (costUsd) store.setCostUsd(costUsd);
        store.setPhase('complete');
        sessionStore.fetchSessions(MODULE_ID);
      },
      onError: (message) => {
        store.setIsStreaming(false);
        store.setAgentStatus(null);
        store.addChatEntry({ id: `error-${Date.now()}`, role: 'assistant', content: `Error: ${message}`, timestamp: Date.now() });
      },

      // ── Writer-specific handlers ──
      onOutlineCreated: (event) => {
        const sections = event.sections.map((s, i) => ({
          id: s.id, type: s.type, title: s.title, content: '', order: i, status: 'empty' as const, wordCount: 0,
        }));
        store.initSections(sections);
        if (event.title) store.setTitle(event.title);
        if (event.doc_id) store.setDocId(event.doc_id);
      },
      onSectionStart: (sectionId) => {
        store.startSectionStream(sectionId);
      },
      onSectionStream: (sectionId, delta) => {
        store.appendStreamDelta(sectionId, delta);
      },
      onSectionComplete: (sectionId, wordCount) => {
        store.completeSection(sectionId, wordCount);
      },
      onReferenceAdded: (ref) => {
        store.addReference({
          number: ref.number, title: ref.title, authors: ref.authors || [], year: ref.year, venue: ref.venue,
        });
      },
      onReferenceRemoved: (refNumber) => {
        store.removeReference(refNumber);
      },
      onFigureCreated: (fig) => {
        store.addFigure({
          id: fig.id, sectionId: fig.section_id, caption: fig.caption, url: fig.url, order: fig.number || 1, number: fig.number,
        });
      },
      onCodeExecuting: (description) => {
        store.setAgentStatus({ action: 'coding', content: description });
      },
    };

    // Start SSE stream
    const client = new ResilientSSEClient();
    sseRef.current = client;

    client.start(
      MODULE_ID,
      text,
      {
        template: store.templateId,
        language: store.language,
        doc_id: store.docId || undefined,
      },
      handlers,
      sessionStore.currentSessionId || undefined,
    );
  }, [input, store, sessionStore, taskStore]);

  const handleStop = useCallback(() => {
    sseRef.current?.stop();
    store.setIsStreaming(false);
    store.setAgentStatus(null);
  }, [store]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const agentLabel = store.agentStatus?.action
    ? {
        thinking: 'Thinking...',
        searching: 'Searching literature...',
        writing: 'Writing...',
        coding: 'Generating visualization...',
        done: '',
      }[store.agentStatus.action] || store.agentStatus.action
    : '';

  return (
    <div className="flex h-full">
      {/* Left: Chat panel */}
      <div className="flex flex-col w-[400px] min-w-[320px] border-r border-border">
        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {store.chatEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-accent/50 flex items-center justify-center mb-4">
                <span className="text-3xl">✍️</span>
              </div>
              <h2 className="text-lg font-display font-semibold mb-1">WriterAI</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Describe the paper you want to write. Include the topic, target venue, and any specific requirements.
              </p>
            </div>
          )}

          {store.chatEntries.map((entry) => (
            <div
              key={entry.id}
              className={`text-sm ${
                entry.role === 'user'
                  ? 'bg-accent/30 rounded-lg p-3 ml-8'
                  : entry.role === 'tool'
                  ? 'text-xs text-muted-foreground px-3 py-1 flex items-center gap-1'
                  : 'px-3 py-2'
              }`}
            >
              {entry.role === 'tool' && (
                <span className={`w-1.5 h-1.5 rounded-full ${entry.toolStatus === 'error' ? 'bg-red-400' : 'bg-green-400'}`} />
              )}
              {entry.content}
            </div>
          ))}

          {/* Agent status indicator */}
          {store.isStreaming && agentLabel && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-[var(--warm-highlight)] animate-pulse" />
              <span className="text-xs text-[var(--warm-highlight)]">{agentLabel}</span>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="p-3 border-t border-border">
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your paper topic..."
              rows={2}
              className="flex-1 resize-none bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--warm-highlight)] placeholder:text-muted-foreground/60"
              disabled={store.isStreaming}
            />
            <button
              onClick={store.isStreaming ? handleStop : handleSend}
              disabled={!store.isStreaming && !input.trim()}
              className="self-end px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {store.isStreaming ? 'Stop' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* Right: Document preview */}
      <div className="flex-1">
        <DocumentPreview />
      </div>
    </div>
  );
}
