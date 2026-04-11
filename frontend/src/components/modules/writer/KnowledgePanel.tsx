'use client';

import { useCallback, useEffect, useState } from 'react';
import { writerApi } from '@/lib/api-client';

interface KnowledgeDoc {
  doc_id: string;
  filename: string;
  title?: string;
  status: string;
  total_pages: number;
  total_chunks: number;
  created_at: string;
}

interface KnowledgePanelProps {
  onClose: () => void;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  completed: { text: '已完成', cls: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  processing: { text: '处理中', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  failed: { text: '失败', cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  pending: { text: '等待中', cls: 'bg-muted text-muted-foreground' },
};

export default function KnowledgePanel({ onClose }: KnowledgePanelProps) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(() => {
    writerApi.listKnowledge().then(setDocs).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await writerApi.uploadKnowledge(file);
      refresh();
    } catch {
      // handled
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      await writerApi.deleteKnowledge(docId);
      setDocs((prev) => prev.filter((d) => d.doc_id !== docId));
    } catch {
      // handled
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
        <h3 className="text-sm font-medium">知识库</h3>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            刷新
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
          上传 PDF 作为写作参考资料。这些文档不会出现在论文引用列表中。
        </p>

        {/* Upload */}
        <label className={`flex items-center justify-center gap-1.5 border border-dashed border-border/60 rounded-lg py-4 text-xs cursor-pointer hover:bg-accent/20 hover:border-border transition-all ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <span className="text-muted-foreground">{uploading ? '上传中...' : '+ 上传 PDF'}</span>
          <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>

        {/* Document list */}
        {docs.map((doc) => {
          const st = STATUS_LABEL[doc.status] || STATUS_LABEL.pending;
          return (
            <div key={doc.doc_id} className="flex items-start justify-between p-3 rounded-lg bg-accent/20 border border-border/30">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{doc.title || doc.filename}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${st.cls}`}>{st.text}</span>
                  {doc.total_chunks > 0 && (
                    <span className="text-[10px] text-muted-foreground/50">{doc.total_chunks} 段落</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(doc.doc_id)}
                className="text-muted-foreground/40 hover:text-red-500 ml-2 shrink-0 transition-colors p-0.5"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          );
        })}

        {docs.length === 0 && !uploading && (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground/40">暂无文档</p>
          </div>
        )}
      </div>
    </div>
  );
}
