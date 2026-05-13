'use client';

/**
 * TournamentAct — Act IV: pairwise Elo ranking.
 *
 * The dramatic centerpiece of IdeaSpark. As `evaluate_match` events
 * arrive, candidate cards are reordered by current Elo and animate
 * vertically into their new positions via Framer Motion's `layout`.
 *
 * A small floating bubble shows the live "A vs B → winner" pair, fades
 * itself out after a short hold. The current #1 carries a warm halo
 * via `rank-glow-1`.
 *
 * NOTE: No box-border surrounds the list — only spacing + a per-card
 * left fade rail. The ranking number itself is the visual rhythm.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { AgentSigil } from '../../shared/AgentSigil';

interface TournamentActProps {
  events: Array<{ type: string; [key: string]: any }>;
}

interface CandidateState {
  id: string;
  author: string;
  preview: string;
  elo: number;
}

interface RecentMatch {
  key: string;
  aAuthor: string;
  bAuthor: string;
  winner: string;
}

export function TournamentAct({ events }: TournamentActProps) {
  /** Derived live ranking from match stream + final votes. */
  const { candidates, matchesDone, latestMatch } = useMemo(() => {
    const elo = new Map<string, CandidateState>();
    const matches = events.filter((e) => e.type === 'evaluate_match');
    for (const m of matches) {
      // Use the post-match elo emitted by backend for each id.
      const a: CandidateState = {
        id: m.a_id,
        author: m.a_author,
        preview: m.a_preview ?? '',
        elo: typeof m.a_elo === 'number' ? m.a_elo : 1500,
      };
      const b: CandidateState = {
        id: m.b_id,
        author: m.b_author,
        preview: m.b_preview ?? '',
        elo: typeof m.b_elo === 'number' ? m.b_elo : 1500,
      };
      // Always replace — backend emits cumulative Elo per match.
      elo.set(a.id, a);
      elo.set(b.id, b);
    }
    // Late stage: final vote events override with definitive scores.
    const votes = events.filter((e) => e.type === 'vote');
    for (const v of votes) {
      const existing = elo.get(v.idea_id);
      elo.set(v.idea_id, {
        id: v.idea_id,
        author: v.author,
        preview: existing?.preview ?? (v.content ?? '').slice(0, 80).replace(/\n/g, ' '),
        elo: typeof v.elo_score === 'number' ? v.elo_score : (existing?.elo ?? 1500),
      });
    }
    const list = Array.from(elo.values()).sort((a, b) => b.elo - a.elo);
    const last = matches[matches.length - 1];
    return {
      candidates: list,
      matchesDone: matches.length,
      latestMatch: last
        ? {
            key: `${last.a_id}-${last.b_id}-${matches.length}`,
            aAuthor: last.a_author,
            bAuthor: last.b_author,
            winner: last.winner,
          }
        : null,
    };
  }, [events]);

  /** Recent-match overlay (auto-dismiss). */
  const [recent, setRecent] = useState<RecentMatch | null>(null);
  useEffect(() => {
    if (!latestMatch) return;
    setRecent(latestMatch);
    const t = setTimeout(() => setRecent((r) => (r?.key === latestMatch.key ? null : r)), 2400);
    return () => clearTimeout(t);
  }, [latestMatch]);

  return (
    <div className="relative">
      {candidates.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground/45 italic pl-1">评审者正在准备比较…</p>
      ) : (
        <div className="space-y-2 relative">
          <AnimatePresence initial={false}>
            {candidates.map((c, idx) => (
              <CandidateRow key={c.id} rank={idx + 1} candidate={c} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {recent && (
          <motion.div
            key={recent.key}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="absolute right-0 top-0 max-w-[260px] rounded-xl bg-card/85 backdrop-blur-md px-3.5 py-2.5 shadow-[0_10px_36px_-14px_rgba(0,0,0,0.18)]"
          >
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.24em] text-warm/70 mb-1">
              Just judged
            </p>
            <div className="flex items-center gap-2 text-[11.5px]">
              <AgentSigil agent={recent.aAuthor} state="idle" size="sm" showZh={false} />
              <span className="text-muted-foreground/40">↔</span>
              <AgentSigil agent={recent.bAuthor} state="idle" size="sm" showZh={false} />
              <span className="ml-auto text-[10.5px] text-foreground/70 font-medium">
                {recent.winner === 'A' ? 'A 胜' : recent.winner === 'B' ? 'B 胜' : '平局'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CandidateRow({ rank, candidate }: { rank: number; candidate: CandidateState }) {
  const isTop = rank === 1;
  return (
    <motion.article
      layout
      layoutId={`rank-${candidate.id}`}
      transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.7 }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`relative flex items-center gap-4 rounded-xl px-4 py-3 ${isTop ? 'rank-glow-1' : ''}`}
      style={{
        background: isTop
          ? 'linear-gradient(to right, color-mix(in oklab, var(--color-warm) 9%, transparent) 0%, transparent 60%)'
          : 'transparent',
      }}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-3 bottom-3 w-[2px] rounded-full transition-colors duration-300 ${
          isTop ? 'opacity-100' : 'opacity-25'
        }`}
        style={{
          background: isTop
            ? 'linear-gradient(to bottom, transparent, var(--color-warm), transparent)'
            : 'linear-gradient(to bottom, transparent, color-mix(in oklab, var(--color-foreground) 35%, transparent), transparent)',
        }}
      />

      <span
        className={`shrink-0 w-9 text-center tabular-nums leading-none ${
          isTop ? 'text-warm' : 'text-foreground/60'
        }`}
        style={{ fontFamily: 'var(--font-display)', fontSize: isTop ? '26px' : '20px' }}
      >
        {rank}
      </span>

      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <AgentSigil agent={candidate.author} state="idle" size="sm" />
          {isTop && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.22em] text-warm/75">
              <Trophy className="h-3 w-3" /> Leading
            </span>
          )}
        </div>
        {candidate.preview && (
          <p className="text-[11.5px] text-foreground/65 leading-relaxed line-clamp-2 tracking-tight">
            {candidate.preview}
          </p>
        )}
      </div>

      <span
        className={`shrink-0 font-mono tabular-nums text-[12px] ${
          isTop ? 'text-warm/85 font-semibold' : 'text-muted-foreground/60'
        }`}
      >
        {Math.round(candidate.elo)}
      </span>
    </motion.article>
  );
}
