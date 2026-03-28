"use client";

import { useCallback, useState } from "react";
import { documentApi } from "@/lib/api-client";

interface DocStatus {
  doc_id: string;
  filename: string;
  status: string;
  title?: string;
  total_chunks?: number;
  error_message?: string;
}

export default function DocumentUploader() {
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<DocStatus[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const result = await documentApi.upload(file);
      const newDoc: DocStatus = {
        doc_id: result.doc_id,
        filename: result.filename,
        status: result.status,
      };
      setDocuments((prev) => [newDoc, ...prev]);

      // 轮询状态直到完成
      const pollStatus = async () => {
        const interval = setInterval(async () => {
          try {
            const status = await documentApi.getStatus(result.doc_id);
            setDocuments((prev) =>
              prev.map((d) => (d.doc_id === result.doc_id ? { ...d, ...status } : d))
            );
            if (status.status === "completed" || status.status === "failed") {
              clearInterval(interval);
            }
          } catch {
            clearInterval(interval);
          }
        }, 2000);
      };
      pollStatus();
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/30";
      case "processing": return "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30";
      case "failed": return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30";
      default: return "text-muted-foreground bg-muted";
    }
  };

  return (
    <div className="space-y-4">
      {/* 上传区域 */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver ? "border-warm bg-warm/5" : "border-border hover:border-muted-foreground/40"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-warm border-t-transparent" />
            <span className="text-sm text-muted-foreground">上传中...</span>
          </div>
        ) : (
          <>
            <svg className="mx-auto h-12 w-12 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="mt-2 text-sm text-muted-foreground">拖拽 PDF 文件到此处，或</p>
            <label className="mt-2 inline-block cursor-pointer rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
              选择文件
              <input type="file" className="hidden" accept=".pdf,.md,.html,.docx" onChange={handleFileInput} />
            </label>
            <p className="mt-1 text-xs text-muted-foreground/60">支持 PDF、Markdown、HTML、DOCX</p>
          </>
        )}
      </div>

      {/* 文档列表 */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">已上传文档</h3>
          {documents.map((doc) => (
            <div key={doc.doc_id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{doc.filename}</p>
                {doc.title && <p className="truncate text-xs text-muted-foreground">{doc.title}</p>}
              </div>
              <div className="ml-3 flex items-center gap-2">
                {doc.total_chunks != null && doc.total_chunks > 0 && (
                  <span className="text-xs text-muted-foreground">{doc.total_chunks} 分块</span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(doc.status)}`}>
                  {doc.status === "completed" ? "完成" : doc.status === "processing" ? "处理中" : doc.status === "failed" ? "失败" : "等待"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
