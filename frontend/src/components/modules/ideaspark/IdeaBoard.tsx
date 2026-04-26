'use client';

import { useState } from 'react';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { Trophy, DollarSign, LayoutGrid, List, Lightbulb } from 'lucide-react';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

const AGENT_NAMES: Record<string, string> = {
  divergent: '发散者', expert: '领域专家', critic: '审辩者',
  connector: '整合者', evaluator: '评审者',
};

const AGENT_DESC: Record<string, string> = {
  divergent: '提出新颖角度',
  expert: '基于领域知识',
  critic: '审辩与改进',
  connector: '整合多方观点',
  evaluator: '评估并打分',
};

const RANK_TONE: Record<number, string> = {
  1: 'border-amber-300/70 bg-amber-50/40 dark:border-amber-500/40 dark:bg-amber-900/15',
  2: 'border-stone-300/70 bg-stone-50/40 dark:border-stone-500/40 dark:bg-stone-900/15',
  3: 'border-orange-300/70 bg-orange-50/30 dark:border-orange-500/30 dark:bg-orange-900/10',
};

const RANK_TROPHY_COLOR: Record<number, string> = {
  1: 'text-amber-500 dark:text-amber-400',
  2: 'text-stone-400 dark:text-stone-300',
  3: 'text-orange-500 dark:text-orange-400',
};

export function IdeaBoard() {
  const { ideas, topIdeas, phase, costUsd } = useIdeaSparkStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  const hasResults = topIdeas.length > 0;

  if (!hasResults && ideas.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center px-6">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-warm)]/10 border border-[var(--color-warm)]/20">
          <Lightbulb className="h-6 w-6 text-[var(--color-warm)]" />
        </div>
        <p className="text-[13px] text-muted-foreground/70 max-w-xs">
          {phase === 'idle'
            ? '在「对话」中输入研究主题，5 个智能体协作生成创意后，会在这里展示完整内容'
            : '正在生成创意...'}
        </p>
      </div>
    );
  }

  // 优先展示 Top 创意（按 rank 排序，前 3 名作为主体）
  const ranked = hasResults ? [...topIdeas].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) : [];
  const topThree = ranked.slice(0, 3);
  const remaining = ranked.slice(3);
  const fallbackIdeas = !hasResults ? ideas : [];

  return (
    <div className="space-y-5 p-3 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {hasResults ? `Top ${topIdeas.length} 创意` : `${ideas.length} 个候选创意`}
          </h3>
          {costUsd > 0 && (
            <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground/50 tabular-nums">
              <DollarSign className="h-2.5 w-2.5" /> ${costUsd.toFixed(4)}
            </span>
          )}
        </div>
        {hasResults && remaining.length > 0 && (
          <div className="flex gap-0.5 rounded-md bg-muted/50 p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`rounded p-1 transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              title="列表视图"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded p-1 transition-colors ${viewMode === 'grid' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              title="网格视图"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Top 3 主体卡片 — 大卡 + 完整 markdown */}
      {topThree.length > 0 && (
        <div className="space-y-4">
          {topThree.map((idea) => {
            const rank = idea.rank ?? 0;
            const tone = RANK_TONE[rank] ?? 'border-border';
            const trophyColor = RANK_TROPHY_COLOR[rank] ?? 'text-muted-foreground';
            const agentName = AGENT_NAMES[idea.author] || idea.author;
            const agentDesc = AGENT_DESC[idea.author] || '';
            return (
              <article
                key={idea.id}
                className={`rounded-xl border-2 ${tone} p-5 space-y-3 transition-all`}
              >
                <div className="flex items-baseline gap-3">
                  <Trophy className={`h-5 w-5 shrink-0 ${trophyColor}`} />
                  <div className="text-[20px] font-bold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                    #{rank}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[12.5px] font-medium text-foreground/75">{agentName}</span>
                    {agentDesc && <span className="text-[10.5px] text-muted-foreground/50">{agentDesc}</span>}
                  </div>
                  <span className="ml-auto rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11px] font-mono font-semibold tabular-nums text-foreground/70">
                    Elo {Math.round(idea.eloScore)}
                  </span>
                </div>

                <div className="border-t border-border/30 pt-3">
                  <MarkdownViewer content={idea.content} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 其余创意（Top 4+） */}
      {remaining.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/45">
            其他创意
          </h4>
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'space-y-2'}>
            {remaining.map((idea) => {
              const hasElo = idea.eloScore > 0 && idea.eloScore !== 1500;
              return (
                <div
                  key={idea.id}
                  className="rounded-md border border-border/40 p-3 space-y-1.5 hover:border-[var(--color-warm)]/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-bold text-muted-foreground/60 tabular-nums">#{idea.rank}</span>
                    <span className="text-muted-foreground/55">
                      {AGENT_NAMES[idea.author] || idea.author}
                    </span>
                    {hasElo && (
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground/45 tabular-nums">
                        Elo {Math.round(idea.eloScore)}
                      </span>
                    )}
                  </div>
                  <MarkdownViewer content={idea.content} compact />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 未排序候选（流程未完成时） */}
      {fallbackIdeas.length > 0 && (
        <div className="space-y-2">
          {fallbackIdeas.map((idea) => (
            <div
              key={idea.id}
              className="rounded-md border border-border/40 p-3 space-y-1.5"
            >
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground/55">
                  {AGENT_NAMES[idea.author] || idea.author}
                </span>
              </div>
              <MarkdownViewer content={idea.content} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
