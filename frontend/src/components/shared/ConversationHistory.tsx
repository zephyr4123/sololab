'use client';

import { useEffect } from 'react';
import { Plus, Trash2, MessageSquare, Clock } from 'lucide-react';
import { useSessionStore } from '@/stores/session-store';

interface ConversationHistoryProps {
  moduleId: string;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

export function ConversationHistory({ moduleId }: ConversationHistoryProps) {
  const {
    sessions,
    currentSessionId,
    isLoadingSessions,
    isLoadingHistory,
    fetchSessions,
    loadHistory,
    deleteSession,
    resetConversation,
  } = useSessionStore();

  useEffect(() => {
    fetchSessions(moduleId);
  }, [moduleId, fetchSessions]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
          对话记录
        </h3>
        <button
          onClick={resetConversation}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--color-warm)] hover:bg-[var(--color-warm)]/5 transition-colors"
        >
          <Plus className="h-3 w-3" />
          新建
        </button>
      </div>

      {isLoadingSessions && (
        <div className="flex items-center justify-center py-8 text-[11px] text-muted-foreground/40 tracking-wide">
          加载中...
        </div>
      )}

      {!isLoadingSessions && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <MessageSquare className="h-7 w-7 text-muted-foreground/15 mb-2.5" />
          <p className="text-[11px] text-muted-foreground/35">暂无对话记录</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-0.5">
        {sessions.map((session) => {
          const isActive = session.session_id === currentSessionId;

          return (
            <div
              key={session.session_id}
              className={`group relative rounded-lg px-3 py-2.5 cursor-pointer transition-all duration-200 ${
                isActive
                  ? 'bg-foreground/[0.06] border-l-2 border-l-[var(--color-warm)]'
                  : 'hover:bg-foreground/[0.03] border-l-2 border-l-transparent'
              }`}
              onClick={() => {
                if (!isLoadingHistory && session.session_id !== currentSessionId) {
                  loadHistory(session.session_id);
                }
              }}
            >
              <p className="text-[13px] font-medium leading-snug line-clamp-2 pr-6">
                {session.title || 'Untitled'}
              </p>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/40">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(session.updated_at || session.created_at)}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(session.session_id);
                }}
                className="absolute right-2 top-2.5 hidden rounded-md p-1 text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive group-hover:block transition-colors"
                title="删除对话"
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
