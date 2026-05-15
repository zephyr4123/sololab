'use client';

/**
 * RunnerCard — ranks 2 and 3. Paired side-by-side under the
 * top-ranked card. Each one carries a ghost rank numeral bleeding
 * off the top-left corner so rank is legible at a glance even when
 * the eye skips the header row.
 *
 * Lower visual weight than ChampionCard on purpose:
 *   · no atmospheric backdrop image
 *   · no spotlight gradient
 *   · neutral halo (no warm tint until hover)
 *   · compact MarkdownViewer so 2nd/3rd don't overrun the page
 *
 * Hover lifts the card 2px and adds a warm rim — small but enough
 * to invite clicking through for the full text.
 */

import { motion } from 'framer-motion';
import { AgentSigil } from '../shared/AgentSigil';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

interface RunnerCardProps {
  rank: number;
  author: string;
  eloScore: number;
  content: string;
  delaySec: number;
}

export function RunnerCard({
  rank,
  author,
  eloScore,
  content,
  delaySec,
}: RunnerCardProps) {
  const rankLabel = String(rank).padStart(2, '0');

  return (
    <motion.article
      className="runner-card"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: delaySec, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="runner-watermark" aria-hidden>
        {rankLabel}
      </span>

      <div className="relative z-10 flex items-center gap-3 mb-5">
        <AgentSigil agent={author} size="sm" state="done" />
        <span
          className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground/70"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Elo&nbsp;
          <span className="font-medium text-foreground/85">
            {Math.round(eloScore)}
          </span>
        </span>
      </div>

      <span aria-hidden className="soft-divider mb-4 block" />

      <div className="relative z-10 text-[12.5px] leading-[1.7]">
        <MarkdownViewer content={content} compact />
      </div>
    </motion.article>
  );
}
