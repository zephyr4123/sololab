'use client';

/**
 * IdeaCurtain — done state. The applause moment.
 *
 * Hero summary on the left margin (eyebrow + serif headline + tabular
 * stats), then Top 3 cards stagger into view, then the rest in a quiet
 * column. CurtainActions sit at the bottom; toggling "完整时间线"
 * surfaces ProcessRecap inline.
 */

import { useMemo, useState } from 'react';
import { AgentSigil } from '../shared/AgentSigil';
import { ResultCard } from './ResultCard';
import { CurtainActions } from './CurtainActions';
import { ProcessRecap } from '../recap/ProcessRecap';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useSessionStore } from '@/stores/session-store';

interface IdeaCurtainProps {
  moduleId: string;
  onRequestNewRound: () => void;
  onOpenDrawer: () => void;
}

export function IdeaCurtain({
  moduleId: _moduleId,
  onRequestNewRound,
  onOpenDrawer,
}: IdeaCurtainProps) {
  const topIdeas = useIdeaSparkStore((s) => s.topIdeas);
  const costUsd = useIdeaSparkStore((s) => s.costUsd);
  const chatEntries = useSessionStore((s) => s.chatEntries);
  const [recapOpen, setRecapOpen] = useState(false);

  const ranked = useMemo(
    () => [...topIdeas].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
    [topIdeas],
  );

  const stats = useMemo(() => {
    const lastStream = [...chatEntries].reverse().find((e) => e.kind === 'stream');
    const events = lastStream?.events ?? [];
    return {
      tools: events.filter((e) => e.type === 'tool').length,
      papers: events
        .filter((e) => e.type === 'tool' && typeof (e as any).result_count === 'number')
        .reduce((s, e) => s + ((e as any).result_count || 0), 0),
      ideas: events.filter((e) => e.type === 'idea').length,
      matches: events.filter((e) => e.type === 'evaluate_match').length,
    };
  }, [chatEntries]);

  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  const handleExport = () => {
    if (!ranked.length) return;
    const now = new Date().toLocaleString('zh-CN');
    let md = `# IdeaSpark — 辩论结果\n\n> ${now}  ·  Top ${ranked.length}  ·  费用 $${costUsd.toFixed(4)}\n\n---\n\n`;
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
      {/* Single warm orb — atmosphere without GPU cost. */}
      <div className="warm-orb" style={{ top: '-8%', right: '-4%', width: 560, height: 560 }} aria-hidden />

      <div className="relative mx-auto w-full max-w-[820px] px-10 py-12 space-y-12 curtain-rise">
        {/* Hero summary */}
        <header className="flex items-start gap-5">
          <span className="eyebrow-rule shrink-0 mt-3" style={{ width: 56 }} aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-warm/75">
              curtain · debate concluded
            </p>
            <h1
              className="mt-3 text-[clamp(28px,3.6vw,38px)] leading-[1.1] tracking-[-0.02em] text-foreground/90"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {ranked.length} 个创意，已分出名次。
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground/60 tabular-nums">
              <span>{stats.tools} 次检索</span>
              <span className="text-muted-foreground/30">·</span>
              <span>{stats.papers} 篇文献</span>
              <span className="text-muted-foreground/30">·</span>
              <span>{stats.ideas} 个候选</span>
              <span className="text-muted-foreground/30">·</span>
              <span>{stats.matches} 次比较</span>
              {costUsd > 0 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-warm/80">${costUsd.toFixed(4)}</span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Top 3 */}
        {top3.length > 0 && (
          <section className="space-y-6">
            {top3.map((idea, i) => (
              <ResultCard
                key={idea.id}
                rank={idea.rank ?? i + 1}
                author={idea.author}
                eloScore={idea.eloScore}
                content={idea.content}
                delayMs={200 + i * 180}
              />
            ))}
          </section>
        )}

        {/* Rest */}
        {rest.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="eyebrow-rule" aria-hidden />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/50">
                Honourable mentions
              </span>
            </div>
            <div className="space-y-3 pt-2">
              {rest.map((idea, i) => (
                <div
                  key={idea.id}
                  className="group/r relative rounded-xl px-5 py-3.5 transition-colors hover:bg-card/50"
                >
                  <div className="flex items-start gap-4">
                    <span
                      className="shrink-0 w-8 text-center text-[18px] leading-none text-muted-foreground/55 tabular-nums"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {idea.rank ?? i + 4}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-3">
                        <AgentSigil agent={idea.author} state="done" size="sm" />
                        <span className="ml-auto font-mono tabular-nums text-[10.5px] text-muted-foreground/55">
                          Elo {Math.round(idea.eloScore)}
                        </span>
                      </div>
                      <div className="text-[12.5px]">
                        <MarkdownViewer content={idea.content} compact />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Actions */}
        <CurtainActions
          onExport={handleExport}
          onNewRound={onRequestNewRound}
          onToggleRecap={() => setRecapOpen((v) => !v)}
          onOpenDrawer={onOpenDrawer}
          recapOpen={recapOpen}
        />

        {/* Inline recap */}
        {recapOpen && (
          <section className="pt-2">
            <ProcessRecap />
          </section>
        )}
      </div>
    </div>
  );
}
