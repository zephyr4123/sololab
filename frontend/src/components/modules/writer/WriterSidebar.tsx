'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, Trash2, BookOpen, Loader2 } from 'lucide-react';
import { writerApi, type WriterDocumentSummary } from '@/lib/api-client';
import { useWriterStore } from '@/stores/module-stores/writer-store';

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

const TEMPLATE_NAME: Record<string, string> = {
  nature: 'Nature',
  cvpr: 'CVPR',
  iccv: 'ICCV',
  acm: 'ACM',
  ieee: 'IEEE',
  chinese_journal: '中文期刊',
};

export default function WriterSidebar() {
  const docId = useWriterStore((s) => s.docId);
  const isStreaming = useWriterStore((s) => s.isStreaming);
  const loadDocument = useWriterStore((s) => s.loadDocument);
  const newDocument = useWriterStore((s) => s.newDocument);

  const [docs, setDocs] = useState<WriterDocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await writerApi.listDocuments();
      setDocs(
        Array.isArray(list)
          ? [...list].sort(
              (a, b) =>
                new Date(b.updated_at || b.created_at).getTime() -
                new Date(a.updated_at || a.created_at).getTime()
            )
          : []
      );
    } catch (e) {
      console.error('Failed to load writer documents', e);
      setDocs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load + refresh whenever a streaming run completes
  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  useEffect(() => {
    if (!isStreaming) {
      // Re-fetch shortly after streaming ends so newly created docs show up
      const t = setTimeout(fetchDocs, 600);
      return () => clearTimeout(t);
    }
  }, [isStreaming, fetchDocs]);

  const handleSwitch = async (id: string) => {
    if (id === docId || loadingDocId || isStreaming) return;
    setLoadingDocId(id);
    try {
      await loadDocument(id);
    } finally {
      setLoadingDocId(null);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingDocId) return;
    if (!window.confirm('确定要删除这篇文档吗？此操作不可恢复。')) return;
    setDeletingDocId(id);
    try {
      await writerApi.deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.doc_id !== id));
      if (id === docId) newDocument();
    } catch (err) {
      console.error('Failed to delete doc', err);
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleNew = () => {
    if (isStreaming) return;
    newDocument();
  };

  return (
    <div className="flex flex-col h-full w-[260px] min-w-[260px] shrink-0 border-r border-border/40 bg-card/30">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border/30 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-warm/70" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
            我的论文
          </span>
        </div>
        <button
          onClick={handleNew}
          disabled={isStreaming}
          title="新建文档"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-warm hover:bg-warm/10 transition-colors disabled:opacity-30"
        >
          <Plus className="h-3 w-3" />
          新建
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && docs.length === 0 && (
          <div className="flex items-center justify-center py-8 text-[11px] text-muted-foreground/40 gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            加载中...
          </div>
        )}

        {!isLoading && docs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <FileText className="h-7 w-7 text-muted-foreground/20 mb-3" />
            <p className="text-[11px] text-muted-foreground/40 leading-relaxed">
              还没有论文
              <br />
              在右侧聊天框开始写作
            </p>
          </div>
        )}

        <div className="space-y-1">
          {docs.map((doc) => {
            const isActive = doc.doc_id === docId;
            const isLoading = loadingDocId === doc.doc_id;
            const isDeleting = deletingDocId === doc.doc_id;
            return (
              <div
                key={doc.doc_id}
                onClick={() => handleSwitch(doc.doc_id)}
                className={`group/doc relative flex items-start gap-2 rounded-lg px-2.5 py-2.5 cursor-pointer transition-all duration-150 ${
                  isActive
                    ? 'bg-warm/10 border border-warm/20'
                    : 'border border-transparent hover:bg-foreground/[0.04] hover:border-border/40'
                } ${isLoading || isDeleting ? 'opacity-60' : ''}`}
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
                  onClick={(e) => handleDelete(doc.doc_id, e)}
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

                {isLoading && (
                  <Loader2 className="absolute right-2 top-2 h-3 w-3 animate-spin text-warm" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border/30 shrink-0">
        <p className="text-[10px] text-muted-foreground/40 tabular-nums">
          {docs.length > 0 ? `共 ${docs.length} 篇` : ''}
        </p>
      </div>
    </div>
  );
}
