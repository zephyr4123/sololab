'use client';

/**
 * SessionDrawer — IdeaSpark 的会话管理一等公民。
 *
 * 对照 Writer 的 DocumentDrawer：模态抽屉，全屏 backdrop + 左侧 320px 面板。
 * 任何状态（STAGE / THEATER / CURTAIN）都可以打开，⌘H 全局快捷键由
 * IdeaSparkShell 监听后调用 setOpen。
 *
 * 设计要点：
 * - trash 按钮永久显示（不再 hover-only），让删除是显性操作
 * - "新建辩论" 顶置按钮，触发 resetConversation
 * - 总数 footer 给一点信息感
 */

import { useEffect } from 'react';
import { Lightbulb, Plus, Trash2, X, Clock } from 'lucide-react';
import { useSessionStore } from '@/stores/session-store';

interface SessionDrawerProps {
  moduleId: string;
  open: boolean;
  onClose: () => void;
}

function timeAgo(dateStr: string | null | undefined): string {
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

export default function SessionDrawer({ moduleId, open, onClose }: SessionDrawerProps) {
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

  // Fetch on open. We rely on the store's debounced cache (it tracks
  // last-fetched per moduleId), so opening repeatedly doesn't hammer the API.
  useEffect(() => {
    if (open) void fetchSessions(moduleId);
  }, [open, moduleId, fetchSessions]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handlePick = async (sessionId: string) => {
    if (sessionId === currentSessionId || isLoadingHistory) {
      onClose();
      return;
    }
    await loadHistory(sessionId);
    onClose();
  };

  const handleNew = () => {
    resetConversation();
    onClose();
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm('删除这次会话？无法恢复。')) return;
    await deleteSession(sessionId);
  };

  const moduleSessions = sessions.filter((s) => s.module_id === moduleId);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/15 backdrop-blur-[2px] animate-fade-in"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-[320px] bg-card shadow-[8px_0_32px_-12px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-hidden={!open}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="h-[52px] px-4 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-warm/75" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/65">
                历史记录
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNew}
                title="新建会话"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium text-warm hover:bg-warm/10 transition-colors"
              >
                <Plus className="h-3 w-3" />
                新建
              </button>
              <button
                onClick={onClose}
                title="关闭 (Esc)"
                className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Soft seam under header */}
          <span className="soft-divider mx-4 shrink-0" aria-hidden />

          {/* List */}
          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
            {isLoadingSessions && (
              <div className="flex items-center justify-center py-10 text-[11px] text-muted-foreground/40">
                加载中…
              </div>
            )}

            {!isLoadingSessions && moduleSessions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Lightbulb className="h-7 w-7 text-muted-foreground/15 mb-2" />
                <p className="text-[11px] text-muted-foreground/40">还没有运行记录</p>
                <p className="mt-1 text-[10px] text-muted-foreground/30">
                  关闭抽屉后输入一个研究主题
                </p>
              </div>
            )}

            {moduleSessions.map((session) => {
              const isActive = session.session_id === currentSessionId;
              return (
                <div
                  key={session.session_id}
                  className={`group relative rounded-lg px-3 py-2.5 cursor-pointer transition-all duration-150 ${
                    isActive
                      ? 'bg-warm/8 border-l-2 border-l-warm/70'
                      : 'hover:bg-foreground/[0.035] border-l-2 border-l-transparent'
                  }`}
                  onClick={() => void handlePick(session.session_id)}
                  role="button"
                  tabIndex={0}
                >
                  <p className="text-[12.5px] font-medium leading-snug line-clamp-2 pr-7 text-foreground/85">
                    {session.title || '未命名会话'}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/45 tabular-nums">
                    <Clock className="h-2.5 w-2.5" />
                    {timeAgo(session.updated_at || session.created_at)}
                  </div>

                  <button
                    onClick={(e) => void handleDelete(e, session.session_id)}
                    title="删除"
                    className="absolute right-2 top-2.5 rounded-md p-1 text-muted-foreground/35 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 shrink-0 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground/40 tabular-nums">
              {moduleSessions.length > 0 ? `共 ${moduleSessions.length} 场` : ''}
            </p>
            <p className="text-[9.5px] text-muted-foreground/35 tracking-wide">⌘H 切换</p>
          </div>
        </div>
      </aside>
    </>
  );
}
