'use client';

/**
 * TournamentBracket — a single-line SVG visualisation of every
 * pairwise vote that happened during the Elo round-robin.
 *
 *   monogram       (winner glyph above each dot)
 *      ▲   ▲   ▲   ▲   ▲   ▲
 *      ●---●---●---●---●---●   (axis · dashed · time →)
 *
 * Each dot is one `evaluate_match` event. The monogram above marks
 * which persona won. Hovering a dot pops a small tooltip with both
 * sides, the post-match Elos, and the round number — so the user
 * can replay the tournament without leaving the Curtain.
 *
 * Why this exists: the Curtain previously only showed the final
 * Top-N list, hiding the actual deliberation that produced it. The
 * bracket gives the result a *history* — the eye reads "OK these 12
 * matches happened, EXPERT won most of the late ones, that's why
 * they're #1."
 */

import { useMemo, useState } from 'react';
import { getPersona } from '../shared/PersonaMeta';

interface MatchEvent {
  type: 'evaluate_match';
  round: number;
  a_id: string;
  a_author: string;
  a_preview?: string;
  a_elo: number;
  b_id: string;
  b_author: string;
  b_preview?: string;
  b_elo: number;
  winner: string;
}

interface TournamentBracketProps {
  events: Array<{ type: string; [key: string]: any }>;
}

interface ResolvedMatch {
  round: number;
  winnerAuthor: string;
  loserAuthor: string;
  winnerElo: number;
  loserElo: number;
}

function resolveMatch(m: MatchEvent): ResolvedMatch {
  const aWon = (m.winner ?? '').toUpperCase() === 'A';
  return {
    round: m.round,
    winnerAuthor: aWon ? m.a_author : m.b_author,
    loserAuthor: aWon ? m.b_author : m.a_author,
    winnerElo: aWon ? m.a_elo : m.b_elo,
    loserElo: aWon ? m.b_elo : m.a_elo,
  };
}

export function TournamentBracket({ events }: TournamentBracketProps) {
  const matches = useMemo<MatchEvent[]>(
    () => events.filter((e): e is MatchEvent => e.type === 'evaluate_match'),
    [events],
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (matches.length === 0) return null;

  const candidateSet = new Set<string>();
  for (const m of matches) {
    candidateSet.add(m.a_id);
    candidateSet.add(m.b_id);
  }

  const W = 920;
  const H = 96;
  const padX = 36;
  const midY = H / 2 + 8; // shift down a hair to make room for monograms above
  const stepX = (W - padX * 2) / Math.max(matches.length - 1, 1);

  const dotX = (i: number) => padX + i * stepX;

  return (
    <section className="relative space-y-4">
      <div className="flex items-center gap-3">
        <span className="atelier-eyebrow">Evaluation Trace</span>
        <span
          aria-hidden
          className="h-px flex-1 bg-gradient-to-r from-warm/30 via-border/30 to-transparent"
        />
        <span
          className="text-[11px] tabular-nums text-muted-foreground/65 tracking-tight"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {matches.length} 次评估 · {candidateSet.size} 个候选
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-[96px] w-full"
        >
          <line
            className="bracket-axis"
            x1={padX}
            y1={midY}
            x2={W - padX}
            y2={midY}
          />

          {matches.map((m, i) => {
            const r = resolveMatch(m);
            const persona = getPersona(r.winnerAuthor);
            const isHover = hoverIdx === i;
            const x = dotX(i);
            return (
              <g
                key={`${m.a_id}-${m.b_id}-${i}`}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{ cursor: 'pointer' }}
              >
                <text
                  x={x}
                  y={midY - 16}
                  textAnchor="middle"
                  fontSize={isHover ? 16 : 13}
                  fill="var(--color-foreground)"
                  fillOpacity={isHover ? 0.95 : 0.55}
                  style={{
                    fontFamily: 'var(--font-display)',
                    transition: 'font-size 200ms, fill-opacity 200ms',
                  }}
                >
                  {persona?.monogram ?? '·'}
                </text>
                <circle
                  className="bracket-dot"
                  cx={x}
                  cy={midY}
                  r={isHover ? 7 : 5}
                  fill="var(--color-warm)"
                  fillOpacity={isHover ? 1 : 0.72}
                />
                {/* Invisible hit area for easier hover */}
                <rect
                  x={x - stepX / 2}
                  y={0}
                  width={stepX}
                  height={H}
                  fill="transparent"
                />
              </g>
            );
          })}
        </svg>

        {hoverIdx !== null && matches[hoverIdx] && (
          <BracketTooltip
            match={resolveMatch(matches[hoverIdx])}
            xPercent={(dotX(hoverIdx) / W) * 100}
          />
        )}
      </div>
    </section>
  );
}

function BracketTooltip({
  match,
  xPercent,
}: {
  match: ResolvedMatch;
  xPercent: number;
}) {
  const winnerPersona = getPersona(match.winnerAuthor);
  const loserPersona = getPersona(match.loserAuthor);
  return (
    <div
      className="pointer-events-none absolute -top-1 z-20 -translate-x-1/2 -translate-y-full"
      style={{ left: `${xPercent}%` }}
    >
      <div className="rounded-xl bg-card/95 backdrop-blur-md shadow-[0_10px_36px_-10px_rgba(0,0,0,0.18)] px-3.5 py-2.5 ring-1 ring-border/40 whitespace-nowrap">
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className="text-warm"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {winnerPersona?.monogram ?? '·'}
          </span>
          <span className="font-medium text-foreground/90">
            {winnerPersona?.caps ?? match.winnerAuthor.toUpperCase()}
          </span>
          <span
            className="tabular-nums text-warm/80"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {Math.round(match.winnerElo)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10.5px] text-muted-foreground/65">
          <span className="tracking-tight">评分高于</span>
          <span style={{ fontFamily: 'var(--font-display)' }}>
            {loserPersona?.monogram ?? '·'}
          </span>
          <span>{loserPersona?.caps ?? match.loserAuthor.toUpperCase()}</span>
          <span
            className="tabular-nums text-muted-foreground/55"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {Math.round(match.loserElo)}
          </span>
        </div>
        <div
          className="mt-1.5 text-[8.5px] uppercase tracking-[0.24em] text-muted-foreground/45"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          第 {match.round} 轮
        </div>
      </div>
    </div>
  );
}
