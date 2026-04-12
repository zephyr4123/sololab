'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWriterStore, type WriterChatEntry, type WriterSearchResultItem } from '@/stores/module-stores/writer-store';
import { useSessionStore } from '@/stores/session-store';
import { useTaskStore } from '@/stores/task-store';
import { ResilientSSEClient } from '@/lib/sse-client';
import type { StreamHandlers } from '@/types/stream';
import DocumentPreview from './DocumentPreview';

const MODULE_ID = 'writer';

/* ── SVG icon components (14x14, Lucide-style) ── */
const icons = {
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  outline: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 12H3"/><path d="M16 6H3"/><path d="M10 18H3"/></svg>,
  pen: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.855z"/></svg>,
  bookmark: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  code: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  image: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>,
  book: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19v20H6.5a2.5 2.5 0 0 1 0-5H19"/></svg>,
  file: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>,
  tool: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>,
  chevron: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
};

/* ── Tool display config ── */
const TOOL_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  search_literature: { icon: icons.search, label: '检索文献', color: 'text-blue-500 dark:text-blue-400' },
  create_outline: { icon: icons.outline, label: '生成大纲', color: 'text-emerald-500 dark:text-emerald-400' },
  write_section: { icon: icons.pen, label: '撰写章节', color: 'text-amber-600 dark:text-amber-400' },
  manage_reference: { icon: icons.bookmark, label: '管理引用', color: 'text-violet-500 dark:text-violet-400' },
  execute_code: { icon: icons.code, label: '运行代码', color: 'text-orange-500 dark:text-orange-400' },
  insert_figure: { icon: icons.image, label: '插入图表', color: 'text-teal-500 dark:text-teal-400' },
  search_knowledge: { icon: icons.book, label: '检索知识库', color: 'text-indigo-500 dark:text-indigo-400' },
  get_document: { icon: icons.file, label: '读取文档', color: 'text-gray-500 dark:text-gray-400' },
};

const DEFAULT_TOOL_META = { icon: icons.tool, label: '工具', color: 'text-muted-foreground' };

/* ── Source badge colors ── */
const SOURCE_BADGE: Record<string, string> = {
  arxiv: 'bg-red-500/10 text-red-600 dark:text-red-400',
  scholar: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  web: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

/* ── Search result item ── */
function SearchResultItem({ result }: { result: WriterSearchResultItem }) {
  const authorsStr = result.authors.slice(0, 3).join(', ') + (result.authors.length > 3 ? ' 等' : '');
  const badgeCls = SOURCE_BADGE[result.source] || SOURCE_BADGE.web;

  return (
    <div className="py-2 px-2 border-l-2 border-border/40 hover:border-warm/40 transition-colors">
      <div className="flex items-start gap-2">
        <span className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${badgeCls}`}>
          {result.source}
        </span>
        <div className="min-w-0 flex-1">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-foreground/90 hover:text-warm leading-snug line-clamp-2 block"
          >
            {result.title}
          </a>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/60">
            {authorsStr && <span className="truncate">{authorsStr}</span>}
            {result.year && <span className="shrink-0">· {result.year}</span>}
            {result.venue && result.venue !== result.source && <span className="shrink-0 italic">· {result.venue}</span>}
          </div>
          {result.abstract && (
            <p className="text-[10px] text-muted-foreground/50 mt-1 line-clamp-2 leading-relaxed">
              {result.abstract}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Chat entry renderer ── */
function ChatEntry({ entry }: { entry: WriterChatEntry }) {
  const [expanded, setExpanded] = useState(false);

  if (entry.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div className="max-w-[85%] bg-warm/10 dark:bg-warm/5 border border-warm/10 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed">
          {entry.content}
        </div>
      </div>
    );
  }

  if (entry.role === 'tool') {
    const meta = TOOL_META[entry.toolName || ''] || { ...DEFAULT_TOOL_META, label: entry.toolName || '工具' };
    const isError = entry.toolStatus === 'error';
    const isRunning = entry.toolStatus === 'running';
    const hasResults = entry.toolResults && entry.toolResults.length > 0;
    const canExpand = hasResults || !!entry.toolInput;

    return (
      <div
        className={`group px-2 py-1 rounded-md transition-colors ${canExpand ? 'cursor-pointer hover:bg-accent/20' : ''}`}
        onClick={() => canExpand && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden min-w-0">
          <span className={`shrink-0 ${isError ? 'text-red-500' : meta.color}`}>{meta.icon}</span>
          <span className={`text-[11px] font-medium shrink-0 ${isError ? 'text-red-500' : meta.color}`}>
            {meta.label}
          </span>
          {isRunning && (
            <span className="flex gap-0.5 shrink-0">
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </span>
          )}
          {!isRunning && !isError && <span className="text-[10px] text-green-500/70 shrink-0">✓</span>}
          {isError && <span className="text-[10px] text-red-400 shrink-0">✗</span>}
          {entry.toolDetail && (
            <span className="text-[10px] text-muted-foreground/50 truncate ml-auto">{entry.toolDetail}</span>
          )}
          {canExpand && (
            <span className={`text-muted-foreground/40 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}>
              {icons.chevron}
            </span>
          )}
        </div>
        {expanded && hasResults && (
          <div className="mt-2 space-y-1 bg-muted/10 rounded-md py-1 animate-fade-in">
            {entry.toolResults!.map((r, i) => (
              <SearchResultItem key={`${r.url}-${i}`} result={r} />
            ))}
          </div>
        )}
        {expanded && !hasResults && entry.toolInput && (
          <pre className="text-[10px] text-muted-foreground/60 mt-1.5 bg-muted/20 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-28 overflow-y-auto">
            {JSON.stringify(entry.toolInput, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  // assistant — markdown rendering with prose styles
  return (
    <div className="px-1 py-1.5 animate-fade-in">
      <div className="prose prose-sm max-w-none text-foreground/85
        prose-headings:font-display prose-headings:tracking-tight prose-headings:mt-3 prose-headings:mb-1.5
        prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-xs
        prose-p:text-[12.5px] prose-p:leading-relaxed prose-p:my-1.5
        prose-strong:text-foreground prose-strong:font-semibold
        prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-li:text-[12.5px]
        prose-table:text-[11px] prose-th:py-1 prose-td:py-1 prose-th:px-1.5 prose-td:px-1.5
        prose-code:text-[11px] prose-code:px-1 prose-code:rounded prose-code:bg-muted/40
        prose-a:text-warm prose-a:no-underline hover:prose-a:underline
        prose-hr:my-3
        prose-blockquote:border-l-warm prose-blockquote:text-muted-foreground prose-blockquote:italic">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {entry.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

/* ── Update a chat entry in-place (finds last running by tool name) ── */
function updateLastToolEntry(toolName: string, updater: (e: WriterChatEntry) => WriterChatEntry) {
  const entries = useWriterStore.getState().chatEntries;
  const idx = entries.findLastIndex((en) => en.toolName === toolName);
  if (idx < 0) return;
  const updated = [...entries];
  updated[idx] = updater(updated[idx]);
  useWriterStore.setState({ chatEntries: updated });
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
          updateLastToolEntry(toolName, (en) => ({
            ...en,
            toolStatus: e.status,
            // Preserve existing detail unless we have result_count from the tool event
            toolDetail: e.result_count != null ? `找到 ${e.result_count} 条结果` : en.toolDetail,
          }));
        }
      },
      onSearchResults: (e) => {
        // Attach full results to the latest search tool entry
        updateLastToolEntry(e.tool, (en) => ({
          ...en,
          toolResults: e.results,
          toolDetail: `找到 ${e.result_count} 条结果`,
        }));
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
        store.addChatEntry({ id: `error-${Date.now()}`, role: 'assistant', content: `错误：${message}`, timestamp: Date.now() });
      },
      onOutlineCreated: (event) => {
        const sections = event.sections.map((s, i) => ({
          id: s.id, type: s.type, title: s.title, content: '', order: i, status: 'empty' as const, wordCount: 0,
        }));
        store.initSections(sections);
        if (event.title) store.setTitle(event.title);
        if (event.doc_id) store.setDocId(event.doc_id);
        // Update the existing create_outline entry (instead of creating a new one)
        updateLastToolEntry('create_outline', (en) => ({
          ...en,
          toolDetail: `${event.sections.map(s => s.title).join(' → ')}`,
        }));
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

  // Agent status — Chinese
  const statusLabel = (() => {
    if (!store.agentStatus) return '';
    const a = store.agentStatus.action;
    const map: Record<string, string> = {
      thinking: '分析请求中...',
      'Using search_literature...': '检索学术论文...',
      'Using create_outline...': '生成论文结构...',
      'Using write_section...': '撰写章节内容...',
      'Using manage_reference...': '添加引用...',
      'Using execute_code...': '在沙箱中执行代码...',
      'Using insert_figure...': '嵌入图表...',
      'Using search_knowledge...': '查询知识库...',
      'Using get_document...': '检查文档状态...',
      coding: '生成可视化...',
    };
    return map[a] || a;
  })();

  return (
    <div className="flex h-full">
      {/* ── Left: Chat ── */}
      <div className="flex flex-col w-[380px] min-w-[320px] shrink-0 border-r border-border/50">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-warm/20 to-warm/5 flex items-center justify-center text-warm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.855z"/></svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">WriterAI</h2>
              <p className="text-[10px] text-muted-foreground/60">学术论文写作助手</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
          {store.chatEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-warm/10 to-warm/5 border border-warm/10 flex items-center justify-center mb-5 text-warm/60">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 17H8"/><path d="M16 13h-2"/></svg>
              </div>
              <h2 className="text-base font-display font-semibold mb-2 tracking-tight">开始写作</h2>
              <p className="text-xs text-muted-foreground/60 leading-relaxed mb-5 max-w-[280px]">
                描述你想写的论文，包括主题、目标期刊/会议、页数限制和特殊要求。
              </p>
              <div className="w-full space-y-2">
                {[
                  '写一篇关于视觉 Transformer 在医学图像分割中应用的 CVPR 论文，8 页',
                  '写一篇关于大语言模型在代码生成中应用的综述，目标中文期刊',
                  '写一篇关于 2024 年 CRISPR 基因编辑进展的 Nature 文章',
                ].map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(example)}
                    className="w-full text-left text-[11px] text-muted-foreground/70 hover:text-foreground px-3.5 py-2.5 rounded-lg border border-border/30 hover:border-warm/30 hover:bg-warm/5 transition-all leading-relaxed"
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
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-warm/5 border border-warm/10">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warm opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-warm" />
              </span>
              <span className="text-xs text-foreground/60 whitespace-nowrap">{statusLabel}</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border/30 shrink-0">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述你想写的论文..."
              rows={2}
              className="w-full resize-none bg-card/50 border border-border/40 rounded-xl px-4 py-3 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-warm/20 focus:border-warm/30 placeholder:text-muted-foreground/30 transition-all"
              disabled={store.isStreaming}
            />
            <button
              onClick={store.isStreaming ? handleStop : handleSend}
              disabled={!store.isStreaming && !input.trim()}
              className="absolute right-2.5 bottom-2.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-20 bg-warm text-warm-foreground hover:opacity-90 shadow-sm"
            >
              {store.isStreaming ? '■ 停止' : '发送 →'}
            </button>
          </div>
          {store.costUsd > 0 && (
            <p className="text-[10px] text-muted-foreground/40 mt-2 text-right tabular-nums">
              费用：${store.costUsd.toFixed(4)}
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
