'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Trash2, RefreshCw, Loader2, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { documentApi } from '@/lib/api-client';

interface DocInfo {
  doc_id: string;
  filename: string;
  title: string | null;
  status: string;
  total_chunks: number;
  total_pages: number;
  created_at: string | null;
}

export function DocumentManager() {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await documentApi.list();
      setDocs(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleDelete = async (docId: string) => {
    setDeleting(docId);
    try {
      await documentApi.delete(docId);
      setDocs(prev => prev.filter(d => d.doc_id !== docId));
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-3.5 w-3.5 text-[var(--color-warm)]" />;
      case 'failed': return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
      case 'processing': return <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
          文档管理
        </h3>
        <button
          onClick={fetchDocs}
          className="rounded-lg p-1.5 text-muted-foreground/40 hover:bg-foreground/[0.04] hover:text-muted-foreground transition-colors"
          title="刷新"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && docs.length === 0 && (
        <div className="flex items-center justify-center py-6 text-[11px] text-muted-foreground/40">
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> 加载中...
        </div>
      )}

      {!loading && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FileText className="h-7 w-7 text-muted-foreground/15 mb-2.5" />
          <p className="text-[11px] text-muted-foreground/35">暂无上传文档</p>
        </div>
      )}

      <div className="space-y-1.5">
        {docs.map(doc => (
          <div
            key={doc.doc_id}
            className="group flex items-start gap-2.5 rounded-lg border border-border/40 p-2.5 hover:border-border/70 transition-all duration-200"
          >
            <div className="mt-0.5 shrink-0">{statusIcon(doc.status)}</div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug truncate">
                {doc.title || doc.filename}
              </p>
              {doc.title && doc.title !== doc.filename && (
                <p className="text-[10px] text-muted-foreground/40 truncate">{doc.filename}</p>
              )}
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/40">
                {doc.total_pages > 0 && <span>{doc.total_pages} 页</span>}
                {doc.total_chunks > 0 && <span>{doc.total_chunks} 分块</span>}
                {doc.created_at && (
                  <span>{new Date(doc.created_at).toLocaleDateString('zh-CN')}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => handleDelete(doc.doc_id)}
              disabled={deleting === doc.doc_id}
              className="shrink-0 rounded-md p-1 text-muted-foreground/30 hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all duration-200"
              title="删除文档"
            >
              {deleting === doc.doc_id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
