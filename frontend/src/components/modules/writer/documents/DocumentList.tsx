'use client';

/**
 * DocumentList — pure presentation. Renders a list of documents with switch /
 * delete affordances. Data + actions come from props so the same component
 * powers both the slide-out Drawer and the inline rail-expand panel.
 *
 * No fetching, no global state reads — keeps the list dumb and the
 * container in charge of orchestration.
 */

import { FileText, Loader2, Trash2 } from 'lucide-react';
import type { WriterDocumentSummary } from '@/lib/api-client';

const TEMPLATE_NAME: Record<string, string> = {
  nature: 'Nature',
  cvpr: 'CVPR',
  iccv: 'ICCV',
  acm: 'ACM',
  ieee: 'IEEE',
  chinese_journal: '中文期刊',
};

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (Number.isNaN(diff) || diff < 0) return '';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  return `${months} 月前`;
}

interface DocumentListProps {
  docs: WriterDocumentSummary[];
  activeDocId: string | null;
  loadingDocId: string | null;
  deletingDocId: string | null;
  isLoading: boolean;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function DocumentList({
  docs,
  activeDocId,
  loadingDocId,
  deletingDocId,
  isLoading,
  onSwitch,
  onDelete,
}: DocumentListProps) {
  if (isLoading && docs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-[11px] text-muted-foreground/40 gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        加载中...
      </div>
    );
  }

  if (!isLoading && docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <FileText className="h-7 w-7 text-muted-foreground/20 mb-3" />
        <p className="text-[11px] text-muted-foreground/40 leading-relaxed">
          还没有论文
          <br />
          开始写作吧
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {docs.map((doc) => {
        const isActive = doc.doc_id === activeDocId;
        const isSwitching = loadingDocId === doc.doc_id;
        const isDeleting = deletingDocId === doc.doc_id;
        return (
          <div
            key={doc.doc_id}
            onClick={() => onSwitch(doc.doc_id)}
            className={`group/doc relative flex items-start gap-2 rounded-lg px-2.5 py-2.5 cursor-pointer transition-all duration-150 ${
              isActive
                ? 'bg-warm/10 border border-warm/20'
                : 'border border-transparent hover:bg-foreground/[0.04] hover:border-border/40'
            } ${isSwitching || isDeleting ? 'opacity-60' : ''}`}
          >
            <div
              className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 transition-colors ${
                isActive ? 'bg-warm' : 'bg-muted-foreground/20'
              }`}
            />

            <div className="flex-1 min-w-0">
              <p
                className={`text-[12px] leading-snug line-clamp-2 ${
                  isActive ? 'text-foreground font-medium' : 'text-foreground/85'
                }`}
              >
                {doc.title || '未命名文档'}
              </p>
              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/50">
                <span className="font-mono">
                  {TEMPLATE_NAME[doc.template_id] || doc.template_id}
                </span>
                <span>·</span>
                <span className="tabular-nums">{(doc.word_count || 0).toLocaleString()} 字</span>
                <span>·</span>
                <span>{timeAgo(doc.updated_at || doc.created_at)}</span>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('确定要删除这篇文档吗？此操作不可恢复。')) {
                  onDelete(doc.doc_id);
                }
              }}
              disabled={isDeleting}
              title="删除"
              className="shrink-0 p-1 mt-0.5 rounded opacity-0 group-hover/doc:opacity-100 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-30"
            >
              {isDeleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </button>

            {isSwitching && (
              <Loader2 className="absolute right-2 top-2 h-3 w-3 animate-spin text-warm" />
            )}
          </div>
        );
      })}
    </div>
  );
}
