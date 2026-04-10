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

export default function KnowledgePanel() {
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

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    };
    return colors[status] || colors.pending;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Knowledge Base</h4>
        <button onClick={refresh} className="text-xs text-muted-foreground hover:text-foreground">
          Refresh
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Upload PDFs as internal context. These will NOT appear as citations.
      </p>

      {/* Upload */}
      <label className={`flex items-center justify-center gap-1 border border-dashed border-border rounded-lg py-3 text-xs cursor-pointer hover:bg-accent/30 transition-colors ${uploading ? 'opacity-50' : ''}`}>
        <span>{uploading ? 'Uploading...' : '+ Upload PDF'}</span>
        <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
      </label>

      {/* Document list */}
      {docs.length > 0 && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {docs.map((doc) => (
            <div key={doc.doc_id} className="flex items-center justify-between p-2 rounded bg-card border border-border/50">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{doc.title || doc.filename}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge(doc.status)}`}>{doc.status}</span>
                  {doc.total_chunks > 0 && (
                    <span className="text-[10px] text-muted-foreground">{doc.total_chunks} chunks</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(doc.doc_id)}
                className="text-xs text-muted-foreground hover:text-red-500 ml-2 shrink-0"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
