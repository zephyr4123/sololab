'use client';

/**
 * ChatColumn — left rail of the THEATER layout.
 *
 * Holds:
 *   - a slim header (the IdeaSpark mark + drawer hook)
 *   - the chat history (user turns + per-stream digest)
 *   - an inline whisper showing the live status (no box, italic warm)
 *   - the compact composer pinned at the bottom
 *
 * No border on the column itself — separation from the right pane is a
 * single faint vertical gradient rule rendered by the Theater parent.
 */

import { useEffect, useRef, useState } from 'react';
import { History, Lightbulb, Loader2, Paperclip, Send, Square, X, FileText, CheckCircle } from 'lucide-react';
import { useSessionStore } from '@/stores/session-store';
import { ChatEntry } from './ChatEntry';
import { useIdeaSparkStream } from '../hooks/useIdeaSparkStream';
import { documentApi } from '@/lib/api-client';

interface ChatColumnProps {
  moduleId: string;
  onToggleHistory: () => void;
  historyOpen: boolean;
}

interface UploadedDoc {
  docId: string;
  filename: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
}

export function ChatColumn({ moduleId: _moduleId, onToggleHistory, historyOpen }: ChatColumnProps) {
  const entries = useSessionStore((s) => s.chatEntries);
  const { send, stop, isStreaming, statusLabel } = useIdeaSparkStream();

  const [text, setText] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, statusLabel]);

  const submit = async () => {
    if (!text.trim() || isStreaming) return;
    const topic = text.trim();
    const docIds = uploadedDocs.filter((d) => d.status === 'completed' && d.docId).map((d) => d.docId);
    setText('');
    setUploadedDocs([]);
    await send(topic, { docIds });
  };

  const pollStatus = (docId: string) => {
    const poll = async () => {
      try {
        const r = await documentApi.getStatus(docId);
        setUploadedDocs((prev) => prev.map((d) => (d.docId === docId ? { ...d, status: r.status as UploadedDoc['status'] } : d)));
        if (r.status === 'processing' || r.status === 'pending') setTimeout(poll, 2000);
      } catch { /* swallow */ }
    };
    void poll();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const placeholder: UploadedDoc = { docId: '', filename: file.name, status: 'uploading' };
      setUploadedDocs((prev) => [...prev, placeholder]);
      try {
        const r = await documentApi.upload(file);
        setUploadedDocs((prev) =>
          prev.map((d) =>
            d.filename === file.name && d.status === 'uploading' ? { ...d, docId: r.doc_id, status: 'processing' } : d,
          ),
        );
        pollStatus(r.doc_id);
      } catch {
        setUploadedDocs((prev) =>
          prev.map((d) => (d.filename === file.name && d.status === 'uploading' ? { ...d, status: 'failed' } : d)),
        );
      }
    }
  };

  return (
    <div className="flex h-full w-[400px] min-w-[360px] max-w-[440px] shrink-0 flex-col">
      {/* Header */}
      <div className="h-[52px] shrink-0 flex items-center gap-2.5 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm/10 text-warm">
          <Lightbulb className="h-3.5 w-3.5" strokeWidth={2.2} />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="text-[13px] font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            IdeaSpark
          </span>
          <span className="text-[10px] text-muted-foreground/45 tracking-wide">
            五心智 · 一辩论
          </span>
        </div>
        <button
          onClick={onToggleHistory}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
            historyOpen ? 'bg-warm/10 text-warm' : 'text-muted-foreground/55 hover:text-foreground hover:bg-foreground/[0.04]'
          }`}
          title="历史辩论"
        >
          <History className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {entries.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center animate-fade-in">
            <p className="text-[12px] text-muted-foreground/55 max-w-[220px] leading-relaxed">
              输入研究主题，五个智能体会在右侧舞台展开辩论。
            </p>
          </div>
        )}

        {entries.map((entry, i) => (
          <ChatEntry key={i} entry={entry} />
        ))}

        {isStreaming && statusLabel && (
          <div className="flex items-center gap-2.5 px-1 pt-1 animate-fade-in">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warm/65" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warm" />
            </span>
            <span className="text-[11.5px] italic text-warm/80 tracking-wide truncate">
              {statusLabel}
            </span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Composer — no border, soft surface */}
      <div className="shrink-0 px-5 pb-5 pt-2">
        <div className="relative rounded-xl bg-card/55 backdrop-blur-sm transition-all focus-within:bg-card/85 focus-within:shadow-[0_8px_28px_-14px_rgba(0,0,0,0.16)]">
          {uploadedDocs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
              {uploadedDocs.map((d) => (
                <span
                  key={d.filename}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    d.status === 'completed'
                      ? 'bg-warm/8 text-warm'
                      : d.status === 'failed'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-foreground/[0.05] text-muted-foreground'
                  }`}
                >
                  {d.status === 'completed' ? (
                    <CheckCircle className="h-2.5 w-2.5" />
                  ) : d.status === 'failed' ? (
                    <X className="h-2.5 w-2.5" />
                  ) : (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  )}
                  <FileText className="h-2.5 w-2.5" />
                  <span className="max-w-[110px] truncate">{d.filename}</span>
                  <button
                    onClick={() => setUploadedDocs((p) => p.filter((x) => x.filename !== d.filename))}
                    className="rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                  >
                    <X className="h-2 w-2" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={isStreaming ? '辩论进行中…' : '继续辩论 / 提一个新方向…'}
            rows={2}
            disabled={isStreaming}
            className="w-full max-h-32 min-h-[44px] resize-none bg-transparent pl-12 pr-14 py-3 text-[13px] leading-relaxed placeholder:text-muted-foreground/35 focus:outline-none"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.docx"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            className="absolute left-2.5 bottom-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-foreground/[0.04] hover:text-foreground/70"
            title="附加 PDF"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>

          {isStreaming ? (
            <button
              onClick={() => void stop()}
              className="absolute right-2.5 bottom-2.5 flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/55 transition-colors hover:bg-foreground/[0.10]"
              title="停止"
            >
              <Square className="h-3 w-3" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="absolute right-2.5 bottom-2.5 flex h-7 w-7 items-center justify-center rounded-lg bg-warm/15 text-warm transition-all hover:bg-warm/25 disabled:opacity-25"
              title="发送 (Enter)"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
