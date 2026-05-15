'use client';

/**
 * IdeaCurtain — results panel for a finished IdeaSpark run.
 *
 * Layout (top to bottom):
 *   1. CurtainContextStrip · session info + escape hatches
 *   2. Hero band           · "EVALUATION COMPLETE" eyebrow + Chinese
 *                            functional headline + tabular run stats
 *   3. ChampionCard        · Top 1 — spotlight + watermark + drop cap
 *   4. RunnerCard × 2      · Top 2/3 paired side-by-side
 *   5. TournamentBracket   · SVG of every evaluate_match dot
 *   6. MentionsList        · Top 4..N with expandable bodies
 *   7. CurtainActions      · export / recap toggle (content actions)
 *   8. ProcessRecap        · inline expansion of #7
 *
 * Navigation (new run / switch history) lives in the context strip
 * at the top — see CurtainContextStrip's comment for the rationale.
 *
 * Tone: SoloLab is a research tool, not a competition. The copy in
 * this surface deliberately avoids tournament / courtroom / theatre
 * metaphors. The user wants to know which directions are worth
 * pursuing, not which one "won" — phrasing follows that.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChampionCard } from './ChampionCard';
import { RunnerCard } from './RunnerCard';
import { TournamentBracket } from './TournamentBracket';
import { MentionsList } from './MentionsList';
import { CurtainActions } from './CurtainActions';
import { CurtainContextStrip } from './CurtainContextStrip';
import { ProcessRecap } from '../recap/ProcessRecap';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useSessionStore } from '@/stores/session-store';

interface IdeaCurtainProps {
  moduleId: string;
  onRequestNewRound: () => void;
  onOpenDrawer: () => void;
}

export function IdeaCurtain({
  moduleId,
  onRequestNewRound,
  onOpenDrawer,
}: IdeaCurtainProps) {
  const topIdeas = useIdeaSparkStore((s) => s.topIdeas);
  const costUsd = useIdeaSparkStore((s) => s.costUsd);
  const chatEntries = useSessionStore((s) => s.chatEntries);
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const [recapOpen, setRecapOpen] = useState(false);

  useEffect(() => {
    if (sessions.length === 0) {
      void fetchSessions(moduleId);
    }
  }, [moduleId, sessions.length, fetchSessions]);

  const currentSession = useMemo(
    () => sessions.find((s) => s.session_id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );

  const completedAtMs = currentSession?.updated_at
    ? new Date(currentSession.updated_at).getTime()
    : undefined;

  const ranked = useMemo(
    () => [...topIdeas].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
    [topIdeas],
  );

  const events = useMemo(() => {
    const lastStream = [...chatEntries].reverse().find((e) => e.kind === 'stream');
    return lastStream?.events ?? [];
  }, [chatEntries]);

  const stats = useMemo(
    () => ({
      tools: events.filter((e) => e.type === 'tool').length,
      papers: events
        .filter(
          (e) => e.type === 'tool' && typeof (e as any).result_count === 'number',
        )
        .reduce((s, e) => s + ((e as any).result_count || 0), 0),
      ideas: events.filter((e) => e.type === 'idea').length,
      matches: events.filter((e) => e.type === 'evaluate_match').length,
    }),
    [events],
  );

  const champion = ranked[0];
  const runners = ranked.slice(1, 3);
  const mentions = ranked.slice(3);

  const handleExport = () => {
    if (!ranked.length) return;
    const now = new Date().toLocaleString('zh-CN');
    let md = `# IdeaSpark — 推演结果\n\n> ${now}  ·  Top ${ranked.length}  ·  费用 $${costUsd.toFixed(4)}\n\n---\n\n`;
    for (const idea of ranked) {
      md += `## #${idea.rank ?? '?'}  —  Elo ${Math.round(idea.eloScore)}\n\n> 来源：${idea.author}\n\n${idea.content}\n\n---\n\n`;
    }
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ideaspark-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative h-full overflow-y-auto">
      {/* Atmospheric blob anchored top-right, behind the hero band */}
      <div
        className="warm-orb"
        style={{ top: '-12%', right: '-6%', width: 620, height: 620 }}
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[960px] space-y-12 px-10 py-10 champion-rise">
        <CurtainContextStrip
          sessionTitle={currentSession?.title}
          completedAtMs={completedAtMs}
          onNewRound={onRequestNewRound}
          onOpenDrawer={onOpenDrawer}
        />

        {/* Hero band — eyebrow + functional headline + run stats */}
        <header className="space-y-5">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px w-10 bg-warm/55" />
            <span
              className="atelier-eyebrow text-warm/95"
              style={{ letterSpacing: '0.36em' }}
            >
              Evaluation Complete
            </span>
          </div>
          <h1
            className="leading-[1.1] tracking-[-0.02em] text-foreground/95"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(34px, 4.8vw, 56px)',
            }}
          >
            已生成 <span className="text-warm">{ranked.length}</span> 个研究方向，按 Elo 评分排序。
          </h1>
          <div
            className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 text-[11.5px] tabular-nums text-muted-foreground/65"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <StatPill label="检索" value={stats.tools} />
            <StatPill label="文献" value={stats.papers} />
            <StatPill label="候选" value={stats.ideas} />
            <StatPill label="评估对" value={stats.matches} />
            {costUsd > 0 && (
              <StatPill
                label="USD"
                value={`$${costUsd.toFixed(4)}`}
                tone="warm"
              />
            )}
          </div>
        </header>

        {/* Champion */}
        {champion && (
          <ChampionCard
            rank={champion.rank ?? 1}
            author={champion.author}
            eloScore={champion.eloScore}
            content={champion.content}
          />
        )}

        {/* Silver + Bronze */}
        {runners.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {runners.map((r, i) => (
              <RunnerCard
                key={r.id}
                rank={r.rank ?? i + 2}
                author={r.author}
                eloScore={r.eloScore}
                content={r.content}
                delaySec={0.4 + i * 0.16}
              />
            ))}
          </div>
        )}

        {/* Tournament path */}
        <TournamentBracket events={events} />

        {/* Honourable mentions */}
        <MentionsList mentions={mentions} />

        {/* Secondary content actions — navigation lives in the strip above */}
        <CurtainActions
          onExport={handleExport}
          onToggleRecap={() => setRecapOpen((v) => !v)}
          recapOpen={recapOpen}
        />

        {recapOpen && (
          <section className="pt-2">
            <ProcessRecap />
          </section>
        )}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'warm';
}) {
  // Detect Chinese / non-ASCII labels so we don't apply the wide
  // uppercase tracking that's meant for caps eyebrows. Mixed Latin
  // (e.g., "USD") keeps the eyebrow treatment.
  const isAsciiLabel = /^[\x00-\x7F]+$/.test(label);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className={`tabular-nums ${
          tone === 'warm' ? 'text-warm/85' : 'text-foreground/82'
        }`}
      >
        {value}
      </span>
      <span
        className={
          isAsciiLabel
            ? 'text-[9.5px] uppercase tracking-[0.26em] text-muted-foreground/55'
            : 'text-[11px] tracking-tight text-muted-foreground/65'
        }
      >
        {label}
      </span>
    </span>
  );
}
