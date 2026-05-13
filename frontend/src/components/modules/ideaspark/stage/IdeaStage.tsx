'use client';

/**
 * IdeaStage — the empty-state hero.
 *
 * Centerpiece: serif headline "Where ideas collide.", a single composer
 * card, and four research-prompt suggestions. A warm orb floats behind
 * for atmosphere. No tabs, no chrome — the entire surface is the prompt.
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, FileText, History, Loader2, Paperclip, Send, X, Zap, Sparkles } from 'lucide-react';
import { SuggestionGrid } from './SuggestionGrid';
import { useIdeaSparkStream } from '../hooks/useIdeaSparkStream';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useSessionStore } from '@/stores/session-store';
import { documentApi } from '@/lib/api-client';

interface IdeaStageProps {
  moduleId: string;
  onOpenDrawer: () => void;
}

interface UploadedDoc {
  docId: string;
  filename: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
}

export function IdeaStage({ moduleId, onOpenDrawer }: IdeaStageProps) {
  const [text, setText] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [prefillTick, setPrefillTick] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { send, isStreaming } = useIdeaSparkStream();
  const mode = useIdeaSparkStore((s) => s.mode);
  const setMode = useIdeaSparkStore((s) => s.setMode);
  const sessions = useSessionStore((s) => s.sessions);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);

  // Mount-only: prime the session count badge. Deferred 220ms so the entry
  // animation has finished before the store update kicks a paint.
  useEffect(() => {
    const t = setTimeout(() => void fetchSessions(moduleId), 220);
    return () => clearTimeout(t);
  }, [moduleId, fetchSessions]);

  const moduleSessionsCount = sessions.filter((s) => s.module_id === moduleId).length;

  const handlePick = (prompt: string) => {
    setText(prompt);
    setPrefillTick((t) => t + 1);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  };

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
      } catch {
        /* swallow */
      }
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
            d.filename === file.name && d.status === 'uploading'
              ? { ...d, docId: r.doc_id, status: 'processing' }
              : d,
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
    <div className="relative h-full overflow-hidden">
      {/* Single warm orb — atmosphere without GPU thrash. Sized so it
          still spans the upper third of the viewport visually. */}
      <div className="warm-orb" style={{ top: '14%', left: '24%', width: 520, height: 520 }} aria-hidden />

      <div className="relative h-full flex flex-col items-center justify-center px-6 pt-12 pb-24 overflow-y-auto">
        <div className="w-full max-w-[720px] flex flex-col items-center text-center">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.32em] text-warm/70 mb-6 animate-fade-in-up"
            style={{ animationDelay: '50ms' }}
          >
            ideaspark · studio
          </span>

          <h1
            className="text-[clamp(34px,4.6vw,46px)] leading-[1.08] tracking-[-0.02em] text-foreground/90 animate-fade-in-up"
            style={{ animationDelay: '120ms', fontFamily: 'var(--font-display)' }}
          >
            Where ideas collide.
          </h1>

          <p
            className="mt-3 text-[14px] text-muted-foreground/65 animate-fade-in-up tracking-wide max-w-[440px]"
            style={{ animationDelay: '200ms' }}
          >
            一句话，五个心智，一场辩论 —— 把研究主题交给 IdeaSpark 看看会迸出什么。
          </p>

          <div
            key={`prefill-${prefillTick}`}
            className="mt-10 w-full animate-fade-in-up"
            style={{ animationDelay: '300ms' }}
          >
            <div className="relative w-full rounded-2xl bg-card/65 backdrop-blur-sm shadow-[0_12px_60px_-24px_rgba(0,0,0,0.10)] transition-all focus-within:bg-card/85 focus-within:shadow-[0_20px_70px_-22px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_60px_-20px_rgba(0,0,0,0.45)]">
              {/* Soft warm halo on focus — replaces a hard focus ring */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-[-1px] rounded-2xl opacity-0 transition-opacity duration-300 focus-within:opacity-100"
                style={{
                  background:
                    'linear-gradient(135deg, color-mix(in oklab, var(--color-warm) 28%, transparent), transparent 60%)',
                  maskImage: 'linear-gradient(black, black) content-box, linear-gradient(black, black)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                  padding: '1px',
                }}
              />

              {uploadedDocs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                  {uploadedDocs.map((d) => (
                    <span
                      key={d.filename}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium tracking-tight ${
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
                      <span className="max-w-[140px] truncate">{d.filename}</span>
                      <button
                        onClick={() => setUploadedDocs((prev) => prev.filter((x) => x.filename !== d.filename))}
                        className="rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                      >
                        <X className="h-2 w-2" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                placeholder="抛一个研究问题或假设 —— 你怀疑什么、想被反驳什么、想找什么样的新角度……"
                rows={3}
                disabled={isStreaming}
                className="w-full resize-none bg-transparent px-5 pt-5 pb-2 text-[14.5px] leading-relaxed placeholder:text-muted-foreground/35 text-foreground/90 focus:outline-none max-h-[260px]"
                style={{ fontFamily: 'var(--font-sans)' }}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.md,.docx"
                multiple
                className="hidden"
                onChange={(e) => void handleFiles(e.target.files)}
              />

              <div className="flex items-center gap-2 px-3 pb-3 pt-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                  title="附加 PDF 参考文献"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/45 transition-colors hover:bg-foreground/[0.04] hover:text-foreground/75"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                <button
                  onClick={() => setMode(mode === 'fast' ? 'deep' : 'fast')}
                  disabled={isStreaming}
                  title={
                    mode === 'fast'
                      ? '速跑模式：单轮辩论，约 5 分钟'
                      : '深度模式：3 轮辩论 + 深度评议，约 25 分钟'
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                    mode === 'deep'
                      ? 'bg-warm/12 text-warm hover:bg-warm/18'
                      : 'bg-foreground/[0.04] text-muted-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground/80'
                  }`}
                >
                  {mode === 'fast' ? (
                    <>
                      <Zap className="h-3 w-3" />
                      <span>速跑 · ~5 分</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      <span>深度 · ~25 分</span>
                    </>
                  )}
                </button>

                <div className="flex-1" />

                <button
                  onClick={submit}
                  disabled={!text.trim()}
                  className="group/btn inline-flex items-center gap-1.5 rounded-lg bg-warm px-4 py-2 text-[12.5px] font-medium text-warm-foreground transition-all disabled:opacity-25 hover:opacity-95 shadow-[0_4px_16px_-6px_rgba(184,149,106,0.45)]"
                >
                  开始辩论
                  <Send className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-14 w-full max-w-[860px]">
            <SuggestionGrid onPick={handlePick} />
          </div>
        </div>
      </div>

      {/* History affordance — quiet pill, top-right. Always present. */}
      <button
        onClick={onOpenDrawer}
        title="我的辩论 (⌘H)"
        className="absolute top-5 right-6 z-20 inline-flex items-center gap-1.5 rounded-full bg-card/85 backdrop-blur-sm pl-2.5 pr-3 py-1.5 text-[11px] text-muted-foreground/70 transition-all hover:bg-card hover:text-foreground hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] animate-fade-in"
        style={{ animationDelay: '400ms', animationFillMode: 'both' }}
      >
        <History className="h-3 w-3 text-warm/65" />
        <span className="tracking-wide">我的辩论</span>
        {moduleSessionsCount > 0 && (
          <span className="tabular-nums text-foreground/80 font-medium">
            {moduleSessionsCount}
          </span>
        )}
      </button>
    </div>
  );
}
