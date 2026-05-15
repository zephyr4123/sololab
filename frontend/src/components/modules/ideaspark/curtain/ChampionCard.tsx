'use client';

/**
 * ChampionCard — the Curtain's hero. The top-ranked research
 * direction gets a stage to itself. Four visual layers:
 *
 *   1. atmospheric backdrop  · /atelier/room-ideaspark.png bleeds in
 *      from the right wing, masked so it never crowds the column of
 *      text on the left
 *   2. spotlight wash        · a warm radial gradient drops from the
 *      top centre, lighting the "stage"
 *   3. watermark numeral     · a single 240px+ display serif "01"
 *      sits at top-left in 7% opacity — paper embossing, not UI
 *   4. content stack         · "Top Ranked" eyebrow + AgentSigil,
 *      giant Elo on the right, then a soft divider, then the idea
 *      body with a drop cap on the first paragraph
 *
 * Animation: champion-rise (920ms cubic ease-out) on mount — a
 * fade + lift + blur-clear so the headline direction has weight.
 *
 * Tone: SoloLab is a research platform. No "Champion", no trophy
 * iconography. The card just says "this is the top-ranked direction"
 * and gets out of the way.
 */

import { motion } from 'framer-motion';
import { AgentSigil } from '../shared/AgentSigil';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

interface ChampionCardProps {
  rank: number;
  author: string;
  eloScore: number;
  content: string;
}

export function ChampionCard({ rank, author, eloScore, content }: ChampionCardProps) {
  const rankLabel = String(rank).padStart(2, '0');

  return (
    <motion.article
      className="champion-card relative overflow-hidden"
      initial={{ opacity: 0, y: 32, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="champion-backdrop absolute inset-y-0 right-0 w-[45%]" aria-hidden />
      <div className="champion-spotlight absolute inset-0" aria-hidden />
      <span className="champion-watermark" aria-hidden>
        {rankLabel}
      </span>

      <div className="relative z-10 grid grid-cols-12 gap-x-8 px-12 pt-14 pb-12 min-h-[500px]">
        {/* Top meta band — spans full width */}
        <div className="col-span-12 flex items-start justify-between gap-8">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <span
                className="atelier-eyebrow text-warm/95"
                style={{ letterSpacing: '0.36em' }}
              >
                Top Ranked
              </span>
              <span aria-hidden className="h-px w-12 bg-warm/45" />
              <span className="text-[10px] tabular-nums text-warm/70"
                    style={{ fontFamily: 'var(--font-mono)' }}>
                #{rank}
              </span>
            </div>
            <AgentSigil agent={author} size="md" state="done" />
          </div>

          <div className="flex flex-col items-end shrink-0">
            <span
              className="mb-1 text-[10px] uppercase tracking-[0.32em] text-muted-foreground/55"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Elo
            </span>
            <span className="champion-elo">{Math.round(eloScore)}</span>
          </div>
        </div>

        {/* Soft separator */}
        <span aria-hidden className="soft-divider col-span-12 mt-8 mb-7 block" />

        {/* Idea body — constrained max width on the left so the
            atmospheric backdrop on the right keeps its breathing room */}
        <div className="champion-content col-span-12 max-w-[640px] text-[14.5px] leading-[1.75]">
          <MarkdownViewer content={content} />
        </div>
      </div>
    </motion.article>
  );
}
