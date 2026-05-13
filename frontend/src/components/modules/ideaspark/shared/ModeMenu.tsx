'use client';

/**
 * ModeMenu — Fast / Deep mode switcher rendered as a round-cornered
 * dropdown rather than a flat click-toggle.
 *
 * Visual contract:
 *   - Closed state: a soft chip (icon + label + caret), warm-tinted when
 *     deep is selected, neutral when fast.
 *   - Open state: a rounded panel floating above the chip with two
 *     option cards (icon + name + time estimate + one-line rationale).
 *     The current selection carries a warm left rail; hovering any row
 *     lifts a faint warm wash.
 *
 * Aesthetic principles (Warm Stone):
 *   - No hard borders. The panel reads as a single object via shadow +
 *     backdrop blur, not a box. Rows separate via spacing + a hairline
 *     fade rule rather than `border-b`.
 *   - Animation: a 180ms cubic-bezier scale + Y translate on open,
 *     orchestrated so the caret rotates with the panel rise (not after).
 *
 * Shared between IdeaStage and ChatColumn — pass `compact` for tighter
 * chat-style mounting, the default suits the open-state composer.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles, Zap } from 'lucide-react';
import { useIdeaSparkStore, type IdeaSparkMode } from '@/stores/module-stores/ideaspark-store';

interface ModeMenuProps {
  disabled?: boolean;
  compact?: boolean;
  /** 向上展开(从底部 chat composer) vs 向下展开(从顶部 stage composer)。 */
  placement?: 'up' | 'down';
}

interface OptionMeta {
  id: IdeaSparkMode;
  icon: typeof Zap;
  label: string;
  time: string;
  rationale: string;
}

const OPTIONS: OptionMeta[] = [
  {
    id: 'fast',
    icon: Zap,
    label: '速跑',
    time: '~5 分钟',
    rationale: '单轮辩论 · 适合先看一遍想法',
  },
  {
    id: 'deep',
    icon: Sparkles,
    label: '深度',
    time: '~25 分钟',
    rationale: '3 轮辩论 + 深度评议 · 适合要细节',
  },
];

export function ModeMenu({ disabled, compact, placement = 'up' }: ModeMenuProps) {
  const mode = useIdeaSparkStore((s) => s.mode);
  const setMode = useIdeaSparkStore((s) => s.setMode);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const current = OPTIONS.find((o) => o.id === mode) ?? OPTIONS[0];
  const Icon = current.icon;
  const isDeep = mode === 'deep';

  // Tone of the chip itself:
  //   - open:  warm wash + warm text (most prominent)
  //   - deep:  warm tint when not open (signal: non-default mode)
  //   - fast:  neutral
  const chipTone = open
    ? 'bg-warm/15 text-warm shadow-[0_2px_10px_-4px_rgba(184,149,106,0.35)]'
    : isDeep
      ? 'bg-warm/10 text-warm hover:bg-warm/15'
      : 'bg-foreground/[0.04] text-muted-foreground/75 hover:bg-foreground/[0.07] hover:text-foreground/85';

  const chipSize = compact
    ? 'h-7 gap-1 px-2 text-[10.5px]'
    : 'h-8 gap-1.5 px-2.5 text-[11px]';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title={`当前模式：${current.label} · ${current.time}`}
        className={`inline-flex items-center rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${chipSize} ${chipTone}`}
      >
        <Icon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} aria-hidden />
        <span className="tracking-wide">{current.label}</span>
        <span className={`tabular-nums ${open ? 'opacity-90' : 'opacity-60'}`}>
          · {current.time}
        </span>
        <ChevronDown
          className={`ml-0.5 ${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} opacity-60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          className={`absolute left-0 z-50 w-[268px] mode-menu-panel ${
            placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          role="listbox"
        >
          {/* Caret pointer — subtle, same fill as panel */}
          <span
            aria-hidden
            className={`absolute left-3.5 ${
              placement === 'up' ? '-bottom-1.5' : '-top-1.5'
            } h-3 w-3 rotate-45 bg-card/95 backdrop-blur-md`}
            style={{
              boxShadow:
                placement === 'up'
                  ? '2px 2px 6px -2px rgba(0,0,0,0.08)'
                  : '-2px -2px 6px -2px rgba(0,0,0,0.08)',
            }}
          />

          <div className="relative rounded-2xl bg-card/95 backdrop-blur-md shadow-[0_18px_50px_-18px_rgba(0,0,0,0.22)] dark:shadow-[0_18px_50px_-14px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="px-4 pt-3 pb-2">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/55">
                Debate intensity
              </p>
            </div>

            <div className="px-1.5 pb-1.5">
              {OPTIONS.map((opt, i) => {
                const OptIcon = opt.icon;
                const isActive = opt.id === mode;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      setMode(opt.id);
                      setOpen(false);
                    }}
                    className={`relative w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
                      isActive
                        ? 'bg-warm/8'
                        : 'hover:bg-foreground/[0.035]'
                    }`}
                    style={{ animationDelay: `${60 + i * 40}ms` }}
                  >
                    {/* Active left rail */}
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
                            : 'bg-foreground/[0.05] text-muted-foreground/70'
                        }`}
                      >
                        <OptIcon className="h-3 w-3" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`text-[13px] font-medium tracking-tight ${
                              isActive ? 'text-foreground' : 'text-foreground/85'
                            }`}
                          >
                            {opt.label}
                          </span>
                          <span
                            className={`text-[10.5px] tabular-nums ${
                              isActive ? 'text-warm/80' : 'text-muted-foreground/55'
                            }`}
                          >
                            {opt.time}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/60">
                          {opt.rationale}
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
