'use client';

import { useEffect, useState } from 'react';
import {
  FolderOpen, Plus, Trash2, MessageSquare,
  FileEdit, FileText, FilePlus,
  DollarSign, ArrowLeftRight,
} from 'lucide-react';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import type { CodeLabMessage, MessagePart } from '@/stores/module-stores/codelab-store';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api-client';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const FILE_STATUS_ICON: Record<string, typeof FileText> = {
  read: FileText, modified: FileEdit, created: FilePlus, deleted: Trash2,
};
const FILE_STATUS_COLOR: Record<string, string> = {
  read: 'text-muted-foreground/50', modified: 'text-[var(--color-warm)]', created: 'text-emerald-500', deleted: 'text-destructive',
};

export function CodeLabSidebar({ moduleId }: { moduleId: string }) {
  const workingDirectory = useCodeLabStore((s) => s.workingDirectory);
  const recentDirectories = useCodeLabStore((s) => s.recentDirectories);
  const setWorkingDirectory = useCodeLabStore((s) => s.setWorkingDirectory);
  const leaveDirectory = useCodeLabStore((s) => s.leaveDirectory);
  const files = useCodeLabStore((s) => s.files);
  const costUsd = useCodeLabStore((s) => s.costUsd);
  const sessionId = useCodeLabStore((s) => s.sessionId);
  const setSessionId = useCodeLabStore((s) => s.setSessionId);
  const setMessages = useCodeLabStore((s) => s.setMessages);

  const removeRecentDirectory = useCodeLabStore((s) => s.removeRecentDirectory);

  const {
    sessions, currentSessionId, isLoadingSessions, isLoadingHistory,
    fetchSessions, loadHistory, resetConversation, deleteSession,
  } = useSessionStore();

  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  // Fetch sessions when directory changes
  useEffect(() => {
    if (workingDirectory) {
      fetchSessions(moduleId);
    }
  }, [workingDirectory, moduleId, fetchSessions]);

  // Load CodeLab session history from OpenCode
  const loadCodeLabHistory = async (sid: string) => {
    setLoadingSessionId(sid);
    try {
      // Resolve SoloLab session ID → OpenCode session ID via localStorage mapping
      let ocSid = sid;
      try { ocSid = localStorage.getItem(`codelab_oc_${sid}`) || sid; } catch {}

      const raw: any = await api.modules.run(moduleId, '', { action: 'messages', session_id: ocSid });
      // Backend wraps in { module_id, results: [...] }
      const result = raw?.results?.[0] ?? raw;
      const rawMessages: any[] = result?.messages || [];

      // OpenCode message format: { info: { role, id, time }, parts: [{ type, text }] }
      const msgs: CodeLabMessage[] = rawMessages
        .filter((m: any) => {
          const role = m.info?.role;
          return role === 'user' || role === 'assistant';
        })
        .map((m: any) => {
          const role = m.info.role as 'user' | 'assistant';
          const ocParts: any[] = m.parts || [];

          // Extract text content from OpenCode parts
          const textContent = ocParts
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text || '')
            .join('');

          // Convert to our MessagePart format
          const parts: MessagePart[] = [];
          for (const p of ocParts) {
            if (p.type === 'text' && p.text) {
              parts.push({ kind: 'text', content: p.text });
            } else if (p.type === 'tool') {
              parts.push({
                kind: 'tool',
                toolCall: {
                  id: p.id || `tc_${Date.now()}`,
                  tool: p.tool || 'unknown',
                  input: p.state?.input || {},
                  output: p.state?.output || '',
                  status: 'completed',
                  title: p.state?.title || p.tool || 'unknown',
                  timestamp: Date.now(),
                },
              });
            }
          }

          return {
            id: m.info.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            role,
            content: textContent,
            parts,
            toolCalls: parts.filter((p): p is Extract<MessagePart, {kind:'tool'}> => p.kind === 'tool').map(p => p.toolCall),
            timestamp: m.info.time?.created || Date.now(),
          };
        });
      useCodeLabStore.getState().setMessages(msgs);
      useCodeLabStore.getState().setSessionId(sid);
      useCodeLabStore.getState().setFiles([]);
      useCodeLabStore.getState().clearToolCalls();
      useSessionStore.getState().setCurrentSession(sid);
    } catch (e) {
      // Fallback: just switch session ID, show empty chat
      useCodeLabStore.getState().setMessages([]);
      useCodeLabStore.getState().setSessionId(sid);
      useSessionStore.getState().setCurrentSession(sid);
    } finally {
      setLoadingSessionId(null);
    }
  };

  const modifiedFiles = files.filter((f) => f.status !== 'read');
  const dirName = workingDirectory?.split('/').filter(Boolean).pop() ?? '';

  return (
    <div className="flex flex-col h-full space-y-0">

      {/* ── Project Context ── */}
      <div className="pb-4 border-b border-border/30">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">
          Project
        </p>

        {workingDirectory ? (
          <div className="group">
            <button
              onClick={() => setShowProjectSwitcher(!showProjectSwitcher)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.04]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-warm)]/10">
                <FolderOpen className="h-4 w-4 text-[var(--color-warm)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{dirName}</p>
                <p className="font-mono text-[10px] text-muted-foreground/40 truncate">{workingDirectory}</p>
              </div>
              <ArrowLeftRight className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            {/* Quick project switcher dropdown */}
            {showProjectSwitcher && recentDirectories.length > 1 && (
              <div className="mt-1.5 rounded-lg border border-border/50 bg-card/80 p-1.5 space-y-0.5 animate-fade-in">
                {recentDirectories
                  .filter((d) => d !== workingDirectory)
                  .slice(0, 5)
                  .map((dir) => (
                    <div key={dir} className="group/dir flex items-center rounded-md hover:bg-foreground/[0.04] transition-colors">
                      <button
                        onClick={() => {
                          setWorkingDirectory(dir);
                          setShowProjectSwitcher(false);
                        }}
                        className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left min-w-0"
                      >
                        <FolderOpen className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {dir.split('/').filter(Boolean).pop()}
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeRecentDirectory(dir); }}
                        className="p-1 mr-1 rounded opacity-0 group-hover/dir:opacity-100 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all"
                        title="Remove project"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                <button
                  onClick={() => { leaveDirectory(); setShowProjectSwitcher(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-[var(--color-warm)] transition-colors hover:bg-[var(--color-warm)]/5"
                >
                  <Plus className="h-3 w-3" />
                  Other project...
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/30 px-2.5">No project selected</p>
        )}
      </div>

      {/* ── Sessions (within this project) ── */}
      <div className="flex-1 min-h-0 py-4 border-b border-border/30 flex flex-col">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40">
            Sessions
          </p>
          <button
            onClick={() => {
              resetConversation();
              useCodeLabStore.getState().setMessages([]);
              useCodeLabStore.getState().setSessionId(null);
              useCodeLabStore.getState().setFiles([]);
            }}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-warm)] hover:bg-[var(--color-warm)]/5 transition-colors"
          >
            <Plus className="h-2.5 w-2.5" />
            New
          </button>
        </div>

        {isLoadingSessions && (
          <div className="flex items-center justify-center py-6 text-[10px] text-muted-foreground/30">
            Loading...
          </div>
        )}

        {!isLoadingSessions && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="h-5 w-5 text-muted-foreground/15 mb-2" />
            <p className="text-[10px] text-muted-foreground/30">Start a conversation</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-0.5">
          {sessions.map((session) => {
            const isActive = session.session_id === currentSessionId;
            return (
              <div
                key={session.session_id}
                className={`group/sess flex w-full items-start gap-2 rounded-lg px-2.5 py-2 transition-all duration-150 ${
                  isActive
                    ? 'bg-foreground/[0.06]'
                    : 'hover:bg-foreground/[0.03]'
                }`}
              >
                <button
                  onClick={() => {
                    if (!loadingSessionId && session.session_id !== currentSessionId) {
                      loadCodeLabHistory(session.session_id);
                    }
                  }}
                  className="flex flex-1 items-start gap-2 text-left min-w-0"
                >
                  {/* Active indicator dot */}
                  <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 transition-colors ${
                    isActive ? 'bg-[var(--color-warm)]' : 'bg-transparent'
                  }`} />

                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium leading-snug line-clamp-2">
                      {session.title || 'Untitled'}
                    </p>
                    <span className="text-[10px] text-muted-foreground/35">
                      {loadingSessionId === session.session_id ? 'Loading...' : timeAgo(session.updated_at || session.created_at)}
                    </span>
                  </div>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(session.session_id);
                    if (isActive) {
                      useCodeLabStore.getState().setMessages([]);
                      useCodeLabStore.getState().setSessionId(null);
                      useCodeLabStore.getState().setFiles([]);
                      useCodeLabStore.getState().clearToolCalls();
                    }
                  }}
                  className="mt-1 p-1 rounded opacity-0 group-hover/sess:opacity-100 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                  title="Delete session"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Changed Files ── */}
      {modifiedFiles.length > 0 && (
        <div className="py-4 border-b border-border/30">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">
            Changes ({modifiedFiles.length})
          </p>
          <div className="space-y-0.5">
            {modifiedFiles.slice(0, 6).map((f) => {
              const Icon = FILE_STATUS_ICON[f.status] ?? FileText;
              return (
                <div key={f.path} className="flex items-center gap-2 rounded px-1.5 py-0.5 text-[10px]">
                  <Icon className={`h-3 w-3 shrink-0 ${FILE_STATUS_COLOR[f.status]}`} />
                  <span className="truncate font-mono text-muted-foreground/70">{f.path.split('/').pop()}</span>
                </div>
              );
            })}
            {modifiedFiles.length > 6 && (
              <p className="px-1.5 text-[9px] text-muted-foreground/30">+{modifiedFiles.length - 6} more</p>
            )}
          </div>
        </div>
      )}

      {/* ── Cost ── */}
      {costUsd > 0 && (
        <div className="pt-3">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
            <DollarSign className="h-3 w-3" />
            ${costUsd.toFixed(4)}
          </div>
        </div>
      )}
    </div>
  );
}
