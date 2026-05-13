'use client';

/**
 * TemplateSelector — round-cornered template picker.
 *
 * Visual contract:
 *   - Closed state: a soft chip showing the current template name +
 *     optional page-limit hint + caret. The chip carries a quiet diamond
 *     glyph (◆) as a quiet "template" affordance instead of an icon-form
 *     to keep the surface uncluttered.
 *   - Open state: a rounded panel listing templates as rows
 *     (name + caps eyebrow with page hint). The active row carries a
 *     warm left rail; hovering any row gets a soft warm wash.
 *
 * Shares the .mode-menu-panel CSS keyframe with IdeaSpark's ModeMenu so
 * the two surfaces feel like one design system.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { writerApi, type WriterTemplate } from '@/lib/api-client';
import { useWriterStore } from '@/stores/module-stores/writer-store';

export default function TemplateSelector() {
  const [templates, setTemplates] = useState<WriterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const templateId = useWriterStore((s) => s.templateId);
  const setTemplateId = useWriterStore((s) => s.setTemplateId);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    writerApi.listTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/[0.04] px-2.5 py-1.5 text-[11px] text-muted-foreground/55">
        <span className="h-1 w-1 rounded-full bg-muted-foreground/40 animate-pulse" />
        加载模板…
      </span>
    );
  }

  // Fallback when API yields nothing — keep the UI consistent
  const list = templates.length > 0
    ? templates
    : [{ id: 'nature', name: 'Nature Article', page_limit: undefined } as WriterTemplate];

  const current = list.find((t) => t.id === templateId) ?? list[0];

  const chipTone = open
    ? 'bg-warm/15 text-warm shadow-[0_2px_10px_-4px_rgba(184,149,106,0.35)]'
    : 'bg-foreground/[0.04] text-foreground/75 hover:bg-foreground/[0.07] hover:text-foreground/90';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`模板：${current.name}${current.page_limit ? ` · ${current.page_limit} 页` : ''}`}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-all ${chipTone}`}
      >
        <span
          className={`text-[10px] leading-none ${open ? 'text-warm/90' : 'text-muted-foreground/55'}`}
          style={{ fontFamily: 'var(--font-display)' }}
          aria-hidden
        >
          ◆
        </span>
        <span className="tracking-wide">{current.name}</span>
        {current.page_limit && (
          <span className={`tabular-nums ${open ? 'opacity-90' : 'opacity-55'}`}>
            · {current.page_limit}p
          </span>
        )}
        <ChevronDown
          className={`ml-0.5 h-3 w-3 opacity-60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          className="absolute left-0 bottom-full mb-2 z-50 w-[280px] mode-menu-panel"
          role="listbox"
        >
          <span
            aria-hidden
            className="absolute left-3.5 -bottom-1.5 h-3 w-3 rotate-45 bg-card/95 backdrop-blur-md"
            style={{ boxShadow: '2px 2px 6px -2px rgba(0,0,0,0.08)' }}
          />

          <div className="relative rounded-2xl bg-card/95 backdrop-blur-md shadow-[0_18px_50px_-18px_rgba(0,0,0,0.22)] dark:shadow-[0_18px_50px_-14px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/55">
                Paper template
              </p>
              <span className="text-[9.5px] text-muted-foreground/40 tabular-nums">
                {list.length}
              </span>
            </div>

            <div className="max-h-[300px] overflow-y-auto act-scroll px-1.5 pb-1.5">
              {list.map((t) => {
                const isActive = t.id === templateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      setTemplateId(t.id);
                      setOpen(false);
                    }}
                    className={`relative w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
                      isActive ? 'bg-warm/8' : 'hover:bg-foreground/[0.035]'
                    }`}
                  >
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
                        style={{
                          background:
                            'linear-gradient(to bottom, transparent, var(--color-warm), transparent)',
                        }}
                      />
                    )}

                    <div className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                          isActive
                            ? 'bg-warm/15 text-warm'
                            : 'bg-foreground/[0.05] text-muted-foreground/65'
                        }`}
                      >
                        <FileText className="h-3 w-3" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={`text-[13px] font-medium tracking-tight truncate ${
                              isActive ? 'text-foreground' : 'text-foreground/85'
                            }`}
                          >
                            {t.name}
                          </span>
                          {t.page_limit && (
                            <span
                              className={`shrink-0 text-[10.5px] tabular-nums ${
                                isActive ? 'text-warm/80' : 'text-muted-foreground/55'
                              }`}
                            >
                              {t.page_limit} 页
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/55 tabular-nums">
                          {t.sections.length} 个章节
                          {t.language_default && (
                            <>
                              <span className="mx-1 text-muted-foreground/30">·</span>
                              <span className="uppercase tracking-wide">
                                {t.language_default === 'zh' ? '中文' : t.language_default === 'en' ? 'English' : t.language_default}
                              </span>
                            </>
                          )}
                          {t.citation?.style && (
                            <>
                              <span className="mx-1 text-muted-foreground/30">·</span>
                              {t.citation.style}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
