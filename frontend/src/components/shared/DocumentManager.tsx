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
      case 'completed': return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
      case 'failed': return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
      case 'processing': return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">文档管理</h3>
        <button
          onClick={fetchDocs}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors"
          title="刷新"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && docs.length === 0 && (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> 加载中...
        </div>
      )}

      {!loading && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground/60">暂无上传文档</p>
        </div>
      )}

      <div className="space-y-1.5">
        {docs.map(doc => (
          <div
            key={doc.doc_id}
            className="group flex items-start gap-2 rounded-lg border p-2.5 hover:border-primary/30 transition-colors"
          >
            <div className="mt-0.5 shrink-0">{statusIcon(doc.status)}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug truncate">
                {doc.title || doc.filename}
              </p>
              {doc.title && doc.title !== doc.filename && (
                <p className="text-[10px] text-muted-foreground truncate">{doc.filename}</p>
              )}
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
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
              className="shrink-0 rounded p-1 text-muted-foreground/50 hover:bg-red-100 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
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
