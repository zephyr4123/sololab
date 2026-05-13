'use client';

/**
 * useIdeaSparkStream — wraps ResilientSSEClient + store updates so the
 * Theater shell and ChatColumn share a single send/stop surface.
 *
 * The hook owns:
 *   - the live SSE client lifecycle
 *   - mapping each SSE event onto session-store (chatEntries) and the
 *     ideaspark-store (phase, ideas, topIdeas, cost)
 *   - a friendly `statusLabel` derived from the latest phase + agent
 *     activity (e.g. "✦ 发散者正在检索 arXiv…")
 *
 * It does NOT own the document upload UI — that lives next to compose.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { ResilientSSEClient } from '@/lib/sse-client';
import { api } from '@/lib/api-client';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useSessionStore } from '@/stores/session-store';
import { useTaskStore } from '@/stores/task-store';
import { personaLabel, PHASE_META, type PhaseId } from '../shared/PersonaMeta';

const MODULE_ID = 'ideaspark';

interface SendOptions {
  docIds?: string[];
  /** 'fast' (默认 ~5 分钟) / 'deep' (~25 分钟，用户主动选)。 */
  mode?: 'fast' | 'deep';
}

export interface UseIdeaSparkStreamResult {
  send: (topic: string, opts?: SendOptions) => Promise<void>;
  stop: () => Promise<void>;
  isStreaming: boolean;
  statusLabel: string;
}

export function useIdeaSparkStream(): UseIdeaSparkStreamResult {
  const clientRef = useRef<ResilientSSEClient | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusLabel, setStatusLabel] = useState('');

  const send = useCallback(async (topic: string, opts: SendOptions = {}) => {
    if (!topic.trim() || isStreaming) return;

    const sessionStore = useSessionStore.getState();
    const ideaStore = useIdeaSparkStore.getState();
    const taskStore = useTaskStore.getState();

    sessionStore.appendChatEntry({ kind: 'user', userText: topic });
    sessionStore.appendChatEntry({ kind: 'stream', events: [] });
    ideaStore.reset();
    taskStore.setStatus('running');
    setIsStreaming(true);
    setStatusLabel('启动中…');

    const client = new ResilientSSEClient();
    clientRef.current = client;
    const currentSessionId = sessionStore.currentSessionId || undefined;

    await client.start(
      MODULE_ID,
      topic,
      {
        doc_ids: opts.docIds ?? [],
        mode: opts.mode ?? useIdeaSparkStore.getState().mode,
      },
      {
        onTaskCreated: (sessionId) => {
          if (sessionId) useSessionStore.getState().setCurrentSession(sessionId);
          const taskId = client.getTaskId();
          if (taskId) useTaskStore.getState().setActiveTask(taskId);
        },
        onStatus: (phase, round) => {
          const spark = useIdeaSparkStore.getState();
          spark.setPhase(phase as PhaseId);
          if (round) spark.setRound(round);
          useSessionStore.getState().appendEventToLastEntry({ type: 'status', phase, round });
          const meta = PHASE_META[phase as PhaseId];
          if (meta) setStatusLabel(meta.subtitle || meta.zh);
        },
        onAgent: (agent, action, content, messageCount, event) => {
          useIdeaSparkStore.getState().addAgentEvent({ agent, action, content });
          useSessionStore.getState().appendEventToLastEntry(
            event ?? { type: 'agent', agent, action, content, message_count: messageCount },
          );
          // Friendly status label only for high-signal actions
          if (action === 'thinking') setStatusLabel(`${personaLabel(agent)} 正在准备…`);
          else if (action === 'critique') setStatusLabel(`${personaLabel(agent)} 在审辩中…`);
          else if (action === 'synthesis') setStatusLabel(`${personaLabel(agent)} 在整合…`);
        },
        onTool: (event) => {
          useSessionStore.getState().appendEventToLastEntry(event);
        },
        onIdea: (id, content, author) => {
          useIdeaSparkStore.getState().addIdea({ id, content, author, eloScore: 1500 });
          useSessionStore.getState().appendEventToLastEntry({ type: 'idea', id, content, author });
        },
        onAgentContentDelta: (agent, delta, event) => {
          useSessionStore.getState().appendEventToLastEntry(
            event ?? { type: 'agent_content_delta', agent, delta },
          );
          setStatusLabel(`${personaLabel(agent)} 正在写作…`);
        },
        onToolCallStarted: (agent, tool, query, toolId, event) => {
          useSessionStore.getState().appendEventToLastEntry(
            event ?? { type: 'tool_call_started', agent, tool, query, tool_id: toolId },
          );
          setStatusLabel(`${personaLabel(agent)} 正在检索…`);
        },
        onClusterGroups: (event) => {
          useSessionStore.getState().appendEventToLastEntry(event);
        },
        onEvaluateMatch: (event) => {
          useSessionStore.getState().appendEventToLastEntry(event);
          setStatusLabel('评审者正在成对比较…');
        },
        onVote: (ideaId, content, author, eloScore, rank) => {
          const spark = useIdeaSparkStore.getState();
          spark.setTopIdeas([
            ...spark.topIdeas,
            { id: ideaId, content, author, eloScore, rank, round: spark.currentRound },
          ]);
          useSessionStore.getState().appendEventToLastEntry({
            type: 'vote',
            idea_id: ideaId,
            content,
            author,
            elo_score: eloScore,
            rank,
          });
        },
        onDone: (topIdeas, costUsd) => {
          const spark = useIdeaSparkStore.getState();
          if (topIdeas) {
            spark.setTopIdeas(
              topIdeas.map((t, i) => ({
                id: t.id,
                content: t.content,
                author: t.author,
                eloScore: t.elo_score,
                rank: i + 1,
                round: spark.currentRound,
              })),
            );
          }
          if (costUsd) spark.setCostUsd(costUsd);
          spark.setPhase('done');
          useTaskStore.getState().setStatus('completed');
          useSessionStore.getState().appendEventToLastEntry({
            type: 'done',
            top_ideas: topIdeas,
            cost_usd: costUsd,
          });
          useSessionStore.getState().fetchSessions(MODULE_ID);
          setIsStreaming(false);
          setStatusLabel('');
        },
        onError: (message) => {
          useTaskStore.getState().setStatus('failed');
          useSessionStore.getState().appendEventToLastEntry({ type: 'error', message });
          useSessionStore.getState().fetchSessions(MODULE_ID);
          setIsStreaming(false);
          setStatusLabel('');
        },
        onReconnecting: () => {
          useTaskStore.getState().setStatus('reconnecting');
          setStatusLabel('网络抖动，正在重连…');
        },
      },
      currentSessionId,
    );
  }, [isStreaming]);

  const stop = useCallback(async () => {
    const taskId = useTaskStore.getState().activeTaskId || clientRef.current?.getTaskId();
    if (taskId) {
      try {
        await api.modules.stop(MODULE_ID, taskId);
      } catch {
        // Swallow — best-effort cancel; client.stop() below also signals abort
      }
    }
    clientRef.current?.stop();
    useTaskStore.getState().setStatus('idle');
    useIdeaSparkStore.getState().setPhase('done');
    useSessionStore.getState().appendEventToLastEntry({ type: 'status', phase: 'cancelled' });
    useSessionStore.getState().fetchSessions(MODULE_ID);
    setIsStreaming(false);
    setStatusLabel('');
  }, []);

  return useMemo(
    () => ({ send, stop, isStreaming, statusLabel }),
    [send, stop, isStreaming, statusLabel],
  );
}
