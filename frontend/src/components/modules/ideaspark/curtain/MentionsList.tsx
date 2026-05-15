'use client';

/**
 * MentionsList — ranks 4..N, the lower half of the leaderboard.
 *
 * One row per idea: rank · agent sigil · short preview · Elo · expand
 * chevron. Click a row to expand its full Markdown body inline. The
 * row uses CSS Grid (`.mention-row`) so columns line up across rows.
 *
 * Previously this lived inline in IdeaCurtain.tsx as a flat list with
 * no interaction. Pulling it out lets us keep IdeaCurtain readable
 * and gives lower-ranked candidates their own visual rhythm — not
 * top 3, but not invisible either.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { AgentSigil } from '../shared/AgentSigil';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

interface Mention {
  id: string;
  rank?: number;
  author: string;
  eloScore: number;
  content: string;
}

interface MentionsListProps {
  mentions: Mention[];
}

export function MentionsList({ mentions }: MentionsListProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (mentions.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="atelier-eyebrow">Other Candidates</span>
        <span
          aria-hidden
          className="h-px flex-1 bg-gradient-to-r from-border/55 via-border/30 to-transparent"
        />
        <span
          className="text-[11px] tabular-nums text-muted-foreground/65 tracking-tight"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          + {mentions.length} 个
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {mentions.map((m, i) => {
          const open = openId === m.id;
          const rankLabel = String(m.rank ?? i + 4).padStart(2, '0');
          const preview = stripMarkdown(m.content).slice(0, 90);
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : m.id)}
                className="mention-row w-full text-left"
                aria-expanded={open}
              >
                <span
                  className="text-[16px] leading-none text-muted-foreground/55 tabular-nums"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {rankLabel}
                </span>
                <AgentSigil agent={m.author} size="sm" state="done" />
                <span className="truncate text-[12.5px] text-foreground/70">
                  {preview}
                  {m.content.length > 90 && '…'}
                </span>
                <span
                  className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/65"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  Elo&nbsp;
                  <span className="font-medium text-foreground/85">
                    {Math.round(m.eloScore)}
                  </span>
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/55 transition-transform ${
                    open ? 'rotate-180 text-warm/85' : ''
                  }`}
                  strokeWidth={2.2}
                />
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="ml-[3.5rem] mr-2 mt-2 mb-3 rounded-xl bg-card/40 px-5 py-4 text-[12.5px] leading-[1.7]">
                      <MarkdownViewer content={m.content} compact />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function stripMarkdown(s: string): string {
  return s
    .replace(/[#*_>`~\[\]\(\)\!]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}
