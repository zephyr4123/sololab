'use client';

/**
 * ResultCard — one of the Top 3 cards on the Curtain.
 *
 * Hairless: no border, no harsh divider. Instead, the rank ornament
 * (oversized serif numeral) sits over a faint warm wash that lives
 * inside the card, and a wide soft inset glow handles the perimeter.
 *
 * #1 carries the strongest tint, #2 and #3 decay into near-neutrals so
 * the reader feels the hierarchy from typography alone.
 */

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { AgentSigil } from '../../ideaspark/shared/AgentSigil';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

interface ResultCardProps {
  rank: number;
  author: string;
  eloScore: number;
  content: string;
  delayMs?: number;
}

const RANK_STYLE: Record<number, { wash: string; numTone: string; halo: string }> = {
  1: {
    wash:
      'radial-gradient(ellipse 100% 60% at 0% 0%, color-mix(in oklab, var(--color-warm) 18%, transparent), transparent 60%)',
    numTone: 'text-warm',
    halo: '0 18px 70px -24px color-mix(in oklab, var(--color-warm) 50%, transparent), inset 0 0 0 1px color-mix(in oklab, var(--color-warm) 18%, transparent)',
  },
  2: {
    wash:
      'radial-gradient(ellipse 80% 50% at 0% 0%, color-mix(in oklab, var(--color-warm) 9%, transparent), transparent 60%)',
    numTone: 'text-foreground/75',
    halo: '0 14px 50px -22px rgba(0,0,0,0.12)',
  },
  3: {
    wash:
      'radial-gradient(ellipse 60% 40% at 0% 0%, color-mix(in oklab, var(--color-warm) 6%, transparent), transparent 60%)',
    numTone: 'text-foreground/60',
    halo: '0 10px 40px -20px rgba(0,0,0,0.10)',
  },
};

export function ResultCard({ rank, author, eloScore, content, delayMs = 0 }: ResultCardProps) {
  const tone = RANK_STYLE[rank] ?? RANK_STYLE[3];
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  return (
    <article
      className={`relative rounded-2xl bg-card/65 backdrop-blur-sm px-8 py-7 transition-all duration-700 ease-out ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      }`}
      style={{ backgroundImage: tone.wash, boxShadow: tone.halo }}
    >
      <header className="flex items-baseline gap-5">
        <div className="flex items-baseline gap-3 shrink-0">
          {rank === 1 && <Trophy className="h-5 w-5 text-warm" />}
          <span
            className={`leading-none tabular-nums ${tone.numTone}`}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: rank === 1 ? '46px' : rank === 2 ? '38px' : '32px',
            }}
          >
            {rank}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <AgentSigil agent={author} state="done" size="md" />
        </div>
        <span className="shrink-0 font-mono tabular-nums text-[11.5px] text-muted-foreground/65">
          Elo&nbsp;
          <span className="text-foreground/80 font-medium">{Math.round(eloScore)}</span>
        </span>
      </header>

      {/* Soft separator — gradient hairline that fades both ends */}
      <span className="soft-divider my-5 block" aria-hidden />

      <div className="text-[13.5px]">
        <MarkdownViewer content={content} />
      </div>
    </article>
  );
}
