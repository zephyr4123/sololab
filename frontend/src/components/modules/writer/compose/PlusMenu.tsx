'use client';

/**
 * PlusMenu — expandable "+" button for the writer chat input.
 *
 * Currently hosts a single "附件" (Attachments) section so users can upload
 * reference PDFs/DOCX/MD scoped to the current document. The structure is
 * intentionally section-based so future features (e.g. 插入模板段、从已有文献
 * 导入引用、发起沙箱会话) can slot in as additional `<Section>` blocks
 * without another round of UX redesign.
 *
 * Attachments are isolated per document: upload goes to
 * `project_id = f"writer:{docId}"` on the backend, and `search_knowledge`
 * only returns chunks from the current document's attachments. If the user
 * has no docId yet (brand-new chat), `ensureDocId()` pre-creates an empty
 * document shell before the upload fires — so "can't upload before sending
 * a message" is *not* a limitation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useWriterStore } from '@/stores/module-stores/writer-store';
import { writerApi, type WriterAttachment } from '@/lib/api-client';

const ACCEPT = '.pdf,.md,.txt,.html,.docx';
const POLL_INTERVAL_MS = 2000;

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  processing: '解析中',
  completed: '就绪',
  failed: '失败',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-muted-foreground/60 bg-muted/30',
  processing: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  completed: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  failed: 'text-red-600 dark:text-red-400 bg-red-500/10',
};

function formatBytes(pages: number, chunks: number): string {
  const bits: string[] = [];
  if (pages > 0) bits.push(`${pages} 页`);
  if (chunks > 0) bits.push(`${chunks} 段`);
  return bits.join(' · ');
}

export default function PlusMenu() {
  const docId = useWriterStore((s) => s.docId);
  const attachments = useWriterStore((s) => s.attachments);
  const attachmentsLoading = useWriterStore((s) => s.attachmentsLoading);
  const loadAttachments = useWriterStore((s) => s.loadAttachments);
  const addAttachment = useWriterStore((s) => s.addAttachment);
  const updateAttachment = useWriterStore((s) => s.updateAttachment);
  const removeAttachment = useWriterStore((s) => s.removeAttachment);
  const ensureDocId = useWriterStore((s) => s.ensureDocId);

  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ensuring, setEnsuring] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Reload attachments when docId changes (covers sidebar switch + newDocument)
  useEffect(() => {
    if (docId) void loadAttachments(docId);
  }, [docId, loadAttachments]);

  // Poll status for any attachment that's still processing
  useEffect(() => {
    const hasPending = attachments.some(
      (a) => a.status !== 'completed' && a.status !== 'failed'
    );
    if (!hasPending || !docId) return;

    const interval = setInterval(async () => {
      try {
        const fresh = await writerApi.listAttachments(docId);
        // Shallow-merge: only update attachments whose status changed
        fresh.forEach((f) => {
          const local = attachments.find((a) => a.doc_id === f.doc_id);
          if (!local || local.status !== f.status || local.total_chunks !== f.total_chunks) {
            updateAttachment(f.doc_id, f);
          }
        });
      } catch {
        // silent; next tick will retry
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [attachments, docId, updateAttachment]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (uploading) return;
      setError(null);
      setUploading(true);
      try {
        // Guarantee we have a docId before touching the attachments endpoint
        setEnsuring(true);
        const id = await ensureDocId();
        setEnsuring(false);
        if (!id) throw new Error('Failed to prepare document');

        const result = await writerApi.uploadAttachment(id, file);
        const optimistic: WriterAttachment = {
          doc_id: result.doc_id,
          filename: result.filename,
          status: result.status || 'processing',
          total_pages: 0,
          total_chunks: 0,
          created_at: new Date().toISOString(),
        };
        addAttachment(optimistic);
        // Fire a full refresh shortly after so we pick up any details the
        // backend filled in on the first pass (e.g. total_pages).
        setTimeout(() => {
          if (useWriterStore.getState().docId === id) {
            void loadAttachments(id);
          }
        }, 600);
      } catch (e) {
        console.error('Upload failed', e);
        setEnsuring(false);
        setError(e instanceof Error ? e.message : '上传失败');
      } finally {
        setUploading(false);
      }
    },
    [uploading, ensureDocId, addAttachment, loadAttachments]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
    // Reset input so uploading the same file twice in a row still triggers change
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleUpload(file);
  };

  const handleDelete = async (attachmentId: string) => {
    try {
      await writerApi.deleteAttachment(attachmentId);
      removeAttachment(attachmentId);
    } catch (e) {
      console.error('Delete attachment failed', e);
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  const attachmentCount = attachments.length;
  const hasProcessing = attachments.some(
    (a) => a.status !== 'completed' && a.status !== 'failed'
  );

  return (
    <div ref={rootRef} className="relative">
      {/* ── Trigger "+" button ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="更多操作"
        className={`group relative flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
          open
            ? 'border-warm/40 bg-warm/10 text-warm'
            : 'border-border/40 bg-card/40 text-muted-foreground/70 hover:border-warm/30 hover:bg-warm/5 hover:text-warm'
        }`}
      >
        <Plus
          className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-45' : ''}`}
        />
        {attachmentCount > 0 && (
          <span
            className={`absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-none ${
              hasProcessing
                ? 'bg-blue-500 text-white'
                : 'bg-warm text-warm-foreground'
            }`}
          >
            {attachmentCount}
          </span>
        )}
      </button>

      {/* ── Popover ── */}
      {open && (
        <div
          className="absolute bottom-full left-0 z-50 mb-2 w-[340px] origin-bottom-left animate-fade-in-up overflow-hidden rounded-xl border border-border/50 bg-popover/98 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-sm dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        >
          {/* ═════ Section: 附件 ═════ */}
          <div className="border-b border-border/30 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                <Paperclip className="h-3 w-3" />
                附件
              </div>
              <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                {attachmentCount > 0 ? `${attachmentCount} 个` : '当前对话'}
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/50">
              仅供当前对话内部检索，不会作为引用出现在参考文献中
            </p>
          </div>

          {/* Upload zone */}
          <div className="px-4 pt-3">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-4 text-center transition-all ${
                uploading || ensuring
                  ? 'border-warm/30 bg-warm/5 cursor-wait'
                  : dragOver
                    ? 'border-warm/60 bg-warm/10'
                    : 'border-border/50 hover:border-warm/40 hover:bg-warm/5'
              }`}
            >
              {uploading || ensuring ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-warm/80" />
                  <span className="text-[11px] text-foreground/70">
                    {ensuring ? '准备文档...' : '上传中...'}
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5 text-muted-foreground/40 group-hover:text-warm" />
                  <span className="text-[11px] text-foreground/70">
                    拖拽文件到这里，或
                    <span className="text-warm font-medium"> 点击选择</span>
                  </span>
                  <span className="text-[9px] text-muted-foreground/40">
                    支持 PDF / Markdown / DOCX / TXT
                  </span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={handleFileInput}
                disabled={uploading || ensuring}
              />
            </label>
          </div>

          {/* Error message */}
          {error && (
            <div className="mx-4 mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5">
              <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Attachment list */}
          <div className="max-h-[240px] overflow-y-auto px-2 pb-3 pt-2">
            {attachmentsLoading && attachments.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-4 text-[10px] text-muted-foreground/50">
                <Loader2 className="h-3 w-3 animate-spin" />
                加载附件...
              </div>
            )}

            {!attachmentsLoading && attachments.length === 0 && (
              <div className="py-3 text-center text-[10px] text-muted-foreground/40">
                尚无附件
              </div>
            )}

            <div className="space-y-1">
              {attachments.map((att) => {
                const label = STATUS_LABEL[att.status] || att.status;
                const style =
                  STATUS_STYLE[att.status] || 'text-muted-foreground bg-muted/30';
                const meta = formatBytes(att.total_pages, att.total_chunks);
                return (
                  <div
                    key={att.doc_id}
                    className="group/item flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[11px] leading-snug text-foreground/85"
                        title={att.filename}
                      >
                        {att.filename}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={`rounded px-1 py-[1px] text-[9px] font-medium leading-none ${style}`}
                        >
                          {label}
                        </span>
                        {meta && (
                          <span className="text-[9px] text-muted-foreground/50 tabular-nums">
                            {meta}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(att.doc_id)}
                      title="删除"
                      className="shrink-0 rounded p-1 text-muted-foreground/30 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover/item:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ═════ Future sections slot (commented for clarity) ═════
            <div className="border-t border-border/30 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                ...
              </div>
            </div>
          */}

          {/* Footer: close hint */}
          <div className="flex items-center justify-between border-t border-border/30 bg-muted/20 px-3 py-1.5">
            <span className="text-[9px] text-muted-foreground/40">
              Esc 关闭
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 rounded text-[9px] text-muted-foreground/50 hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
