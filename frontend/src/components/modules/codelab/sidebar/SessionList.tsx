'use client';

/**
 * SessionList — the sidebar's session-history section.
 *
 * Lists OpenCode sessions scoped to the current working directory.
 * Each row is a thin paper slip: warm dot on the left marks the
 * active session, title in the middle, time ago + trash on the
 * right (trash always visible, not hover-gated — matches the
 * IdeaSpark / Writer drawer pattern).
 *
 * Session loading: clicking a row pulls the full message history
 * from OpenCode and replays it into the store. Until the response
 * lands, the row's timestamp slot shows "加载中…" so the user knows
 * something's happening.
 */

import { useEffect, useState } from 'react';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import type { CodeLabMessage, MessagePart } from '@/stores/module-stores/codelab-store';
import { useSessionStore } from '@/stores/session-store';
import { opencode } from '@/lib/opencode-client';
import { codelabSessionApi } from '@/lib/api-client';

interface OcSessionInfo {
  id: string;
  title?: string;
  createdAt?: string;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function SessionList({ workingDirectory }: { workingDirectory: string }) {
  const sessionListVersion = useCodeLabStore((s) => s.sessionListVersion);
  const { currentSessionId, resetConversation } = useSessionStore();
  const codelabSessionId = useCodeLabStore((s) => s.sessionId);

  const [sessions, setSessions] = useState<OcSessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  // Fetch sessions for this directory
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    codelabSessionApi.list(workingDirectory)
      .then((list) => {
        if (cancelled) return;
        setSessions(list.map((s) => ({
          id: s.id,
          title: s.title,
          createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : undefined,
        })));
      })
      .catch(() => { if (!cancelled) setSessions([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [workingDirectory, sessionListVersion]);

  const loadHistory = async (sid: string) => {
    setLoadingSessionId(sid);
    try {
      const rawMessages = await opencode.getMessages(sid);
      const msgs: CodeLabMessage[] = rawMessages
        .filter((m) => m.info.role === 'user' || m.info.role === 'assistant')
        .map((m) => {
          const role = m.info.role as 'user' | 'assistant';
          const ocParts = m.parts || [];
          const textContent = ocParts
            .filter((p) => p.type === 'text')
            .map((p) => p.text || '')
            .join('');
          const parts: MessagePart[] = [];
          for (const p of ocParts) {
            if (p.type === 'text' && p.text) {
              parts.push({ kind: 'text', content: p.text });
            } else if (p.type === 'tool') {
              if (p.tool === 'task') continue;
              parts.push({
                kind: 'tool',
                toolCall: {
                  id: p.id || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                  tool: p.tool || 'unknown',
                  input: (p.state?.input as Record<string, unknown>) || {},
                  output: (p.state?.output as string) || '',
                  status: 'completed',
                  title: (p.state?.title as string) || p.tool || 'unknown',
                  timestamp: (p.state?.time?.start as number) || Date.now(),
                },
              });
            }
          }
          return {
            id: m.info.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            role,
            content: textContent,
            parts,
            toolCalls: parts
              .filter((p): p is Extract<MessagePart, { kind: 'tool' }> => p.kind === 'tool')
              .map((p) => p.toolCall),
            timestamp: m.info.time?.created || Date.now(),
          };
        });
      useCodeLabStore.getState().setMessages(msgs);
      useCodeLabStore.getState().setSessionId(sid);
      useCodeLabStore.getState().setFiles([]);
      useCodeLabStore.getState().clearToolCalls();
      useSessionStore.getState().setCurrentSession(sid);
    } catch {
      useCodeLabStore.getState().setMessages([]);
      useCodeLabStore.getState().setSessionId(sid);
      useSessionStore.getState().setCurrentSession(sid);
    } finally {
      setLoadingSessionId(null);
    }
  };

  const deleteSession = async (sid: string) => {
    if (deletingSessionId) return;
    setDeletingSessionId(sid);
    try {
      await codelabSessionApi.delete(sid);
      setSessions((prev) => prev.filter((s) => s.id !== sid));
      if (sid === codelabSessionId || sid === currentSessionId) {
        useCodeLabStore.getState().setMessages([]);
        useCodeLabStore.getState().setSessionId(null);
        useCodeLabStore.getState().setFiles([]);
        useCodeLabStore.getState().clearToolCalls();
        resetConversation();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '会话删除失败';
      alert(`删除会话失败：${msg}`);
    } finally {
      setDeletingSessionId(null);
    }
  };

  const startNew = () => {
    resetConversation();
    useCodeLabStore.getState().setMessages([]);
    useCodeLabStore.getState().setSessionId(null);
    useCodeLabStore.getState().setFiles([]);
    useCodeLabStore.getState().clearToolCalls();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between mb-2.5">
        <span className="atelier-eyebrow">sessions</span>
        <button
          onClick={startNew}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-warm hover:bg-warm/8 transition-colors"
          title="新会话"
        >
          <Plus className="h-2.5 w-2.5" />
          新建
        </button>
      </div>

      {isLoading && (
        <div
          className="flex items-center justify-center py-6 text-[10px] text-muted-foreground/35"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          loading…
        </div>
      )}

      {!isLoading && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <MessageSquare className="h-5 w-5 text-muted-foreground/20 mb-2" />
          <p className="text-[10.5px] text-muted-foreground/35">尚未开始对话</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-0.5">
        {sessions.map((session) => {
          const isActive = session.id === currentSessionId;
          return (
            <div
              key={session.id}
              className={`group/sess flex w-full items-start gap-2 rounded-lg px-2.5 py-2 transition-all duration-150 ${
                isActive ? 'bg-warm/8' : 'hover:bg-foreground/[0.03]'
              }`}
            >
              <button
                onClick={() => {
                  if (!loadingSessionId && session.id !== currentSessionId) {
                    void loadHistory(session.id);
                  }
                }}
                className="flex flex-1 items-start gap-2 text-left min-w-0"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 transition-colors ${
                    isActive ? 'bg-warm' : 'bg-transparent'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium leading-snug line-clamp-2 text-foreground/85">
                    {session.title || '未命名会话'}
                  </p>
                  <span
                    className="text-[10px] text-muted-foreground/40"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {loadingSessionId === session.id ? '加载中…' : timeAgo(session.createdAt)}
                  </span>
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteSession(session.id);
                }}
                disabled={deletingSessionId === session.id}
                className="p-1 mt-0.5 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50"
                title="删除会话"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
