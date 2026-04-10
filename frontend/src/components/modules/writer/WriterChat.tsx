'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWriterStore, type WriterChatEntry } from '@/stores/module-stores/writer-store';
import { useSessionStore } from '@/stores/session-store';
import { useTaskStore } from '@/stores/task-store';
import { ResilientSSEClient } from '@/lib/sse-client';
import type { StreamHandlers } from '@/types/stream';
import DocumentPreview from './DocumentPreview';

const MODULE_ID = 'writer';

/* ── Tool display config ── */
const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  search_literature: { icon: '🔍', label: 'Searching literature', color: 'text-blue-500 dark:text-blue-400' },
  create_outline: { icon: '📋', label: 'Creating outline', color: 'text-emerald-500 dark:text-emerald-400' },
  write_section: { icon: '✍️', label: 'Writing section', color: 'text-amber-600 dark:text-amber-400' },
  manage_reference: { icon: '📚', label: 'Managing references', color: 'text-violet-500 dark:text-violet-400' },
  execute_code: { icon: '⚡', label: 'Running code', color: 'text-orange-500 dark:text-orange-400' },
  insert_figure: { icon: '📊', label: 'Inserting figure', color: 'text-teal-500 dark:text-teal-400' },
  search_knowledge: { icon: '📖', label: 'Searching knowledge', color: 'text-indigo-500 dark:text-indigo-400' },
  get_document: { icon: '📄', label: 'Reading document', color: 'text-gray-500 dark:text-gray-400' },
};

/* ── Chat entry renderer ── */
function ChatEntry({ entry }: { entry: WriterChatEntry }) {
  const [expanded, setExpanded] = useState(false);

  if (entry.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-primary/10 dark:bg-primary/5 border border-primary/10 rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed">
          {entry.content}
        </div>
      </div>
    );
  }

  if (entry.role === 'tool') {
    const meta = TOOL_META[entry.toolName || ''] || { icon: '🔧', label: entry.toolName || 'Tool', color: 'text-gray-500' };
    const isError = entry.toolStatus === 'error';
    const isRunning = entry.toolStatus === 'running';

    return (
      <div
        className="group flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-accent/30 transition-colors cursor-pointer"
        onClick={() => entry.toolInput && setExpanded(!expanded)}
      >
        <span className="text-sm mt-0.5 shrink-0">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${isError ? 'text-red-500' : meta.color}`}>
              {isRunning ? meta.label : isError ? `${meta.label} failed` : `${meta.label}`}
            </span>
            {isRunning && (
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            )}
            {!isRunning && !isError && (
              <span className="text-[10px] text-green-500">✓</span>
            )}
          </div>
          {entry.toolDetail && (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{entry.toolDetail}</p>
          )}
          {expanded && entry.toolInput && (
            <pre className="text-[10px] text-muted-foreground/70 mt-1 bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
              {JSON.stringify(entry.toolInput, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="px-1 py-1">
      <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
        {entry.content}
      </div>
    </div>
  );
}

/* ── Main component ── */
export default function WriterChat({ moduleId }: { moduleId: string }) {
  const [input, setInput] = useState('');
  const sseRef = useRef<ResilientSSEClient | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const store = useWriterStore();
  const sessionStore = useSessionStore();
  const taskStore = useTaskStore();

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [store.chatEntries, store.agentStatus]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || store.isStreaming) return;

    store.addChatEntry({ id: `user-${Date.now()}`, role: 'user', content: text, timestamp: Date.now() });
    setInput('');
    store.setIsStreaming(true);

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
        const toolName = e.tool || '';
        if (e.status === 'running') {
          store.setAgentStatus({ action: `Using ${toolName}...` });
          store.addChatEntry({
            id: `tool-${Date.now()}-${toolName}-run`,
            role: 'tool', content: '', timestamp: Date.now(),
            toolName, toolStatus: 'running',
            toolInput: e.input,
            toolDetail: e.input?.query as string || e.input?.section_id as string || e.input?.title as string || undefined,
          });
        }
        if (e.status === 'complete' || e.status === 'error') {
          // Update the running entry to complete
          const entries = useWriterStore.getState().chatEntries;
          const runIdx = entries.findLastIndex(
            (en) => en.toolName === toolName && en.toolStatus === 'running'
          );
          if (runIdx >= 0) {
            const updated = [...entries];
            updated[runIdx] = {
              ...updated[runIdx],
              toolStatus: e.status,
              toolDetail: e.result_count != null
                ? `${e.result_count} results found`
                : updated[runIdx].toolDetail,
            };
            // Direct state mutation for performance
            useWriterStore.setState({ chatEntries: updated });
          }
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
      onOutlineCreated: (event) => {
        const sections = event.sections.map((s, i) => ({
          id: s.id, type: s.type, title: s.title, content: '', order: i, status: 'empty' as const, wordCount: 0,
        }));
        store.initSections(sections);
        if (event.title) store.setTitle(event.title);
        if (event.doc_id) store.setDocId(event.doc_id);
        store.addChatEntry({
          id: `outline-${Date.now()}`, role: 'tool', content: '', timestamp: Date.now(),
          toolName: 'create_outline', toolStatus: 'complete',
          toolDetail: `Outline: ${event.sections.map(s => s.title).join(' → ')}`,
        });
      },
      onSectionStart: (sectionId) => { store.startSectionStream(sectionId); },
      onSectionStream: (sectionId, delta) => { store.appendStreamDelta(sectionId, delta); },
      onSectionComplete: (sectionId, wordCount) => { store.completeSection(sectionId, wordCount); },
      onReferenceAdded: (ref) => {
        store.addReference({ number: ref.number, title: ref.title, authors: ref.authors || [], year: ref.year, venue: ref.venue });
      },
      onReferenceRemoved: (refNumber) => { store.removeReference(refNumber); },
      onFigureCreated: (fig) => {
        store.addFigure({ id: fig.id, sectionId: fig.section_id, caption: fig.caption, url: fig.url, order: fig.number || 1, number: fig.number });
      },
      onCodeExecuting: (description) => {
        store.setAgentStatus({ action: 'coding', content: description });
      },
    };

    const client = new ResilientSSEClient();
    sseRef.current = client;
    client.start(MODULE_ID, text, {
      template: store.templateId, language: store.language, doc_id: store.docId || undefined,
    }, handlers, sessionStore.currentSessionId || undefined);
  }, [input, store, sessionStore, taskStore]);

  const handleStop = useCallback(() => {
    sseRef.current?.stop();
    store.setIsStreaming(false);
    store.setAgentStatus(null);
  }, [store]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Agent status display
  const statusLabel = (() => {
    if (!store.agentStatus) return '';
    const a = store.agentStatus.action;
    const map: Record<string, string> = {
      thinking: '🧠 Analyzing request...',
      'Using search_literature...': '🔍 Searching academic papers...',
      'Using create_outline...': '📋 Generating paper structure...',
      'Using write_section...': '✍️ Writing section content...',
      'Using manage_reference...': '📚 Adding citation...',
      'Using execute_code...': '⚡ Executing code in sandbox...',
      'Using insert_figure...': '📊 Embedding figure...',
      'Using search_knowledge...': '📖 Querying knowledge base...',
      'Using get_document...': '📄 Checking document state...',
      coding: '⚡ Generating visualization...',
    };
    return map[a] || a;
  })();

  return (
    <div className="flex h-full">
      {/* ── Left: Chat ── */}
      <div className="flex flex-col w-[420px] min-w-[340px] border-r border-border/60 bg-background">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center">
              <span className="text-sm">✍️</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold">WriterAI</h2>
              <p className="text-[10px] text-muted-foreground">Academic Paper Writing Assistant</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {store.chatEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/30 dark:border-amber-800/20 flex items-center justify-center mb-5 shadow-sm">
                <span className="text-3xl">📝</span>
              </div>
              <h2 className="text-base font-display font-semibold mb-2">Start Writing</h2>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Describe the paper you want to write. Include the topic, target venue, page limit, and any special requirements.
              </p>
              <div className="w-full space-y-1.5">
                {[
                  'Write a CVPR paper about Vision Transformers for medical image segmentation, 8 pages',
                  '写一篇关于大语言模型在代码生成中应用的综述，目标中文期刊',
                  'Write a Nature article about CRISPR gene editing advances in 2024',
                ].map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(example)}
                    className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border/40 hover:border-border hover:bg-accent/20 transition-all"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {store.chatEntries.map((entry) => (
            <ChatEntry key={entry.id} entry={entry} />
          ))}

          {/* Live status */}
          {store.isStreaming && statusLabel && (
            <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-accent/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--warm-highlight)] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--warm-highlight)]" />
              </span>
              <span className="text-xs text-foreground/70">{statusLabel}</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border/40 bg-card/30">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your paper..."
              rows={3}
              className="w-full resize-none bg-card border border-border/60 rounded-xl px-4 py-3 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--warm-highlight)]/30 focus:border-[var(--warm-highlight)]/50 placeholder:text-muted-foreground/40 transition-all"
              disabled={store.isStreaming}
            />
            <button
              onClick={store.isStreaming ? handleStop : handleSend}
              disabled={!store.isStreaming && !input.trim()}
              className="absolute right-2 bottom-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30 bg-[var(--warm-highlight)] text-white hover:opacity-90 shadow-sm"
            >
              {store.isStreaming ? '■ Stop' : 'Send →'}
            </button>
          </div>
          {store.costUsd > 0 && (
            <p className="text-[10px] text-muted-foreground/60 mt-1.5 text-right">
              Cost: ${store.costUsd.toFixed(4)}
            </p>
          )}
        </div>
      </div>

      {/* ── Right: Document ── */}
      <div className="flex-1 min-w-0">
        <DocumentPreview />
      </div>
    </div>
  );
}
