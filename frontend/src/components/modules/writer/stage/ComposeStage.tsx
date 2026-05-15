'use client';

/**
 * ComposeStage — the empty-state hero.
 *
 * Shown when the current document has no chat history and no sections. A
 * focused composition surface: eyebrow, headline, subhead, the compose card,
 * and four suggestion cards. Decorative warm-gold orb floats behind for
 * atmosphere; entrance is a staggered fade-in-up.
 *
 * Doc-list access lives in two affordances:
 *   - the menu button top-left (also serves as ⌘B target),
 *   - the "recent ▾ N papers" pill at the bottom-right when docs exist.
 */

import { useState } from 'react';
import { Menu } from 'lucide-react';
import ComposeInput from '../compose/ComposeInput';
import SuggestionGrid from './SuggestionGrid';

interface ComposeStageProps {
  onOpenDrawer: () => void;
  recentDocsCount: number;
}

export default function ComposeStage({ onOpenDrawer, recentDocsCount }: ComposeStageProps) {
  // `tick` increments on every suggestion pick so ComposeInput's
  // `prefillValue` effect runs even when the same prompt is re-clicked.
  const [prefill, setPrefill] = useState<{ value: string; tick: number } | null>(null);

  return (
    <div className="relative h-full overflow-hidden">
      {/* Drawer trigger — top-left */}
      <button
        onClick={onOpenDrawer}
        title="文档列表 (⌘B)"
        className="absolute top-5 left-5 z-10 p-2 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-accent/40 transition-colors"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Decorative orb — sits behind everything, no pointer events */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[18%] left-[28%] h-[520px] w-[520px] rounded-full opacity-30 blur-[90px] animate-fade-in"
        style={{
          background:
            'radial-gradient(circle, var(--color-warm) 0%, transparent 70%)',
          animationDelay: '0ms',
          animationDuration: '900ms',
        }}
      />

      {/* Main column — vertically centered, biased slightly upward via padding */}
      <div className="relative h-full flex flex-col items-center justify-center px-6 pt-6 pb-20 overflow-y-auto">
        <div className="w-full max-w-[640px] flex flex-col items-center text-center">
          {/* Eyebrow */}
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.28em] text-warm/75 mb-5 animate-fade-in-up"
            style={{ animationDelay: '60ms' }}
          >
            writer · academic drafting
          </span>

          {/* Headline */}
          <h1
            className="text-[clamp(26px,3.8vw,38px)] leading-[1.18] tracking-tight mb-3 animate-fade-in-up text-foreground"
            style={{ animationDelay: '130ms', fontFamily: 'var(--font-display)' }}
          >
            从研究主题到结构化论文初稿。
          </h1>

          {/* Subhead */}
          <p
            className="text-[13.5px] text-muted-foreground/65 mb-9 animate-fade-in-up tracking-wide max-w-[540px]"
            style={{ animationDelay: '190ms' }}
          >
            8 个写作工具协同 · LaTeX/Markdown 双输出 · 引文 / 图表 / 公式一站完成。
          </p>

          {/* Compose card — keyed by prefill tick so picking a suggestion
              remounts the input (fresh state + focus + caret-at-end), even
              if the user re-picks the same suggestion. */}
          <div
            className="w-full animate-fade-in-up"
            style={{ animationDelay: '250ms' }}
          >
            <ComposeInput
              key={prefill ? `prefill-${prefill.tick}` : 'fresh'}
              variant="stage"
              initialValue={prefill?.value}
            />
          </div>
        </div>

        {/* Suggestions — separated by generous space */}
        <div className="mt-14 w-full max-w-[840px]">
          <SuggestionGrid
            onPick={(p) =>
              setPrefill((prev) => ({ value: p, tick: (prev?.tick ?? 0) + 1 }))
            }
          />
        </div>
      </div>

      {/* Bottom-right pill — quick switch to existing documents */}
      {recentDocsCount > 0 && (
        <button
          onClick={onOpenDrawer}
          className="absolute bottom-5 right-5 flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/70 border border-border/40 text-[11px] text-muted-foreground/70 hover:bg-card hover:text-foreground hover:border-warm/30 transition-all backdrop-blur-sm animate-fade-in-up"
          style={{ animationDelay: '420ms' }}
        >
          <span>最近</span>
          <span className="tabular-nums text-foreground/80 font-medium">
            {recentDocsCount}
          </span>
          <span className="text-muted-foreground/50">篇</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
