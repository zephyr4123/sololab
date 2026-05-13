'use client';

/**
 * useWriterStream — single source of truth for WriterAI's send/stop pipeline.
 *
 * Wraps ResilientSSEClient + the long list of writer-specific stream handlers
 * (outline, section_start/stream/complete, references, figures, tools, ...)
 * so any UI surface (STAGE compose card, SPLIT chat panel) can trigger a
 * generation run via the same `send(text)` call.
 *
 * Returns granular selectors (`isStreaming`, `statusLabel`) instead of the
 * full store, so consumers don't re-render on unrelated writer-store changes.
 * Heavy state (chatEntries, sections, references) lives in the store and is
 * subscribed by whichever component renders it.
 */

import { useCallback, useMemo, useRef } from 'react';
import { ResilientSSEClient } from '@/lib/sse-client';
import {
  useWriterStore,
  type WriterChatEntry,
} from '@/stores/module-stores/writer-store';
import { useSessionStore } from '@/stores/session-store';
import type { StreamHandlers } from '@/types/stream';

const MODULE_ID = 'writer';

/** Find the most recent chat entry for a given tool and patch it in place. */
function patchLastToolEntry(
  toolName: string,
  updater: (entry: WriterChatEntry) => WriterChatEntry,
): void {
  const entries = useWriterStore.getState().chatEntries;
  const idx = entries.findLastIndex((e) => e.toolName === toolName);
  if (idx < 0) return;
  const next = [...entries];
  next[idx] = updater(next[idx]);
  useWriterStore.setState({ chatEntries: next });
}

/** Translate the backend's English action strings into UI-friendly Chinese. */
const STATUS_LABELS: Record<string, string> = {
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

export interface UseWriterStreamResult {
  /** Submit `text` to the writer pipeline. No-op if empty or already streaming. */
  send: (text: string) => Promise<void>;
  /** Abort the in-flight SSE stream and clear streaming state. */
  stop: () => void;
  /** True while an SSE stream is active. */
  isStreaming: boolean;
  /** Localized label for the agent's current action (empty if idle). */
  statusLabel: string;
}

export function useWriterStream(): UseWriterStreamResult {
  const sseRef = useRef<ResilientSSEClient | null>(null);

  // Granular subscriptions — only re-render when these specific slices change.
  const isStreaming = useWriterStore((s) => s.isStreaming);
  const agentStatus = useWriterStore((s) => s.agentStatus);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Read fresh state at call time so we don't capture stale store refs.
    const store = useWriterStore.getState();
    const sessionStore = useSessionStore.getState();
    if (store.isStreaming) return;

    store.addChatEntry({
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    });
    store.setIsStreaming(true);

    const handlers: StreamHandlers = {
      onTaskCreated: (sessionId) => {
        if (sessionId) sessionStore.setCurrentSession(sessionId);
      },
      onStatus: (phase) => {
        if (phase === 'cancelled') {
          useWriterStore.getState().setIsStreaming(false);
        }
      },
      onAgent: (_agent, action, content) => {
        const s = useWriterStore.getState();
        s.setAgentStatus({ action, content });
        if (action === 'done' && content) {
          s.addChatEntry({
            id: `agent-${Date.now()}`,
            role: 'assistant',
            content,
            timestamp: Date.now(),
          });
        }
      },
      onTool: (e) => {
        const toolName = e.tool || '';
        const s = useWriterStore.getState();
        if (e.status === 'running') {
          s.setAgentStatus({ action: `Using ${toolName}...` });
          s.addChatEntry({
            id: `tool-${Date.now()}-${toolName}-run`,
            role: 'tool',
            content: '',
            timestamp: Date.now(),
            toolName,
            toolStatus: 'running',
            toolInput: e.input,
            toolDetail:
              (e.input?.query as string) ||
              (e.input?.section_id as string) ||
              (e.input?.title as string) ||
              undefined,
          });
        }
        if (e.status === 'complete' || e.status === 'error') {
          patchLastToolEntry(toolName, (en) => ({
            ...en,
            toolStatus: e.status,
            toolDetail:
              e.result_count != null
                ? `找到 ${e.result_count} 条结果`
                : en.toolDetail,
          }));
        }
      },
      onSearchResults: (e) => {
        patchLastToolEntry(e.tool, (en) => ({
          ...en,
          toolResults: e.results,
          toolDetail: `找到 ${e.result_count} 条结果`,
        }));
      },
      onDone: (_topIdeas, costUsd) => {
        const s = useWriterStore.getState();
        s.setIsStreaming(false);
        s.setAgentStatus(null);
        if (costUsd) s.setCostUsd(costUsd);
        s.setPhase('complete');
        void useSessionStore.getState().fetchSessions(MODULE_ID);
      },
      onError: (message) => {
        const s = useWriterStore.getState();
        s.setIsStreaming(false);
        s.setAgentStatus(null);
        s.addChatEntry({
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `错误：${message}`,
          timestamp: Date.now(),
        });
      },
      onOutlineCreated: (event) => {
        const s = useWriterStore.getState();
        const sections = event.sections.map((section, i) => ({
          id: section.id,
          type: section.type,
          title: section.title,
          content: '',
          order: i,
          status: 'empty' as const,
          wordCount: 0,
        }));
        s.initSections(sections);
        if (event.title) s.setTitle(event.title);
        if (event.doc_id) s.setDocId(event.doc_id);
        patchLastToolEntry('create_outline', (en) => ({
          ...en,
          toolDetail: event.sections.map((sec) => sec.title).join(' → '),
        }));
      },
      onSectionStart: (sectionId) => {
        useWriterStore.getState().startSectionStream(sectionId);
      },
      onSectionStream: (sectionId, delta) => {
        useWriterStore.getState().appendStreamDelta(sectionId, delta);
      },
      onSectionComplete: (sectionId, wordCount) => {
        useWriterStore.getState().completeSection(sectionId, wordCount);
      },
      onSectionContentUpdated: (sectionId, content) => {
        useWriterStore.getState().setSectionContent(sectionId, content);
      },
      onReferenceAdded: (ref) => {
        useWriterStore.getState().addReference({
          number: ref.number,
          title: ref.title,
          authors: ref.authors || [],
          year: ref.year,
          venue: ref.venue,
        });
      },
      onReferenceRemoved: (refNumber) => {
        useWriterStore.getState().removeReference(refNumber);
      },
      onFigureCreated: (fig) => {
        useWriterStore.getState().addFigure({
          id: fig.id,
          sectionId: fig.section_id,
          caption: fig.caption,
          url: fig.url,
          order: fig.number || 1,
          number: fig.number,
        });
      },
      onCodeExecuting: (description) => {
        useWriterStore.getState().setAgentStatus({
          action: 'coding',
          content: description,
        });
      },
    };

    const client = new ResilientSSEClient();
    sseRef.current = client;
    client.start(
      MODULE_ID,
      trimmed,
      {
        template: store.templateId,
        language: store.language,
        doc_id: store.docId || undefined,
      },
      handlers,
      sessionStore.currentSessionId || undefined,
    );
  }, []);

  const stop = useCallback(() => {
    sseRef.current?.stop();
    const s = useWriterStore.getState();
    s.setIsStreaming(false);
    s.setAgentStatus(null);
  }, []);

  const statusLabel = useMemo(() => {
    if (!agentStatus) return '';
    return STATUS_LABELS[agentStatus.action] || agentStatus.action;
  }, [agentStatus]);

  return { send, stop, isStreaming, statusLabel };
}
