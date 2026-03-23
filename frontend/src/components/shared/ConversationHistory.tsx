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
        <h3 className="text-sm font-semibold text-muted-foreground">最近对话</h3>
        <button
          onClick={resetConversation}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent transition-colors"
        >
          <Plus className="h-3 w-3" />
          新建
        </button>
      </div>

      {isLoadingSessions && (
        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
          加载中...
        </div>
      )}

      {!isLoadingSessions && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground/60">暂无对话记录</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-1">
        {sessions.map((session) => {
          const isActive = session.session_id === currentSessionId;

          return (
            <div
              key={session.session_id}
              className={`group relative rounded-lg px-3 py-2.5 cursor-pointer transition-all ${
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              }`}
              onClick={() => {
                if (!isLoadingHistory && session.session_id !== currentSessionId) {
                  loadHistory(session.session_id);
                }
              }}
            >
              <p className="text-sm font-medium leading-snug line-clamp-2 pr-6">
                {session.title || 'Untitled'}
              </p>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(session.updated_at || session.created_at)}
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(session.session_id);
                }}
                className="absolute right-2 top-2.5 hidden rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600 group-hover:block transition-colors"
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
