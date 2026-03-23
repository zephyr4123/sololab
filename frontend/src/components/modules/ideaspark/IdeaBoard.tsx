'use client';

import { useState } from 'react';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { Trophy, DollarSign, LayoutGrid, List } from 'lucide-react';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

const AGENT_NAMES: Record<string, string> = {
  divergent: '发散者', expert: '领域专家', critic: '审辩者',
  connector: '整合者', evaluator: '评审者',
};

export function IdeaBoard() {
  const { ideas, topIdeas, phase, costUsd } = useIdeaSparkStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Show ranked topIdeas first, then unranked ideas
  const hasResults = topIdeas.length > 0;
  const displayIdeas = hasResults ? topIdeas : ideas;

  if (displayIdeas.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        {phase === 'idle' ? '提交研究主题后，创意将在此展示' : '创意生成中...'}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {hasResults ? `Top ${topIdeas.length} 创意` : `${ideas.length} 个创意`}
          </h3>
          {costUsd > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
              <DollarSign className="h-3 w-3" /> ${costUsd.toFixed(4)}
            </span>
          )}
        </div>
        {/* View toggle */}
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
      </div>

      {/* Ideas */}
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'space-y-3'}>
        {displayIdeas.map((idea, idx) => {
          const isTop = hasResults && idx === 0;
          const hasElo = idea.eloScore > 0 && idea.eloScore !== 1500;

          return (
            <div
              key={idea.id}
              className={`rounded-xl border p-4 space-y-2 transition-all ${
                isTop ? 'border-amber-300 bg-amber-50/30' : 'hover:border-primary/40'
              }`}
            >
              {/* Top bar: rank + author + Elo */}
              <div className="flex items-center gap-2">
                {idea.rank && (
                  <div className={`flex items-center gap-1 text-xs font-bold ${
                    idx === 0 ? 'text-amber-600' : idx === 1 ? 'text-gray-500' : 'text-orange-500'
                  }`}>
                    <Trophy className="h-3.5 w-3.5" />
                    #{idea.rank}
                  </div>
                )}
                <span className="text-xs font-medium text-muted-foreground">
                  {AGENT_NAMES[idea.author] || idea.author}
                </span>
                {hasElo && (
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono font-bold">
                    Elo {Math.round(idea.eloScore)}
                  </span>
                )}
              </div>

              {/* Content */}
              <MarkdownViewer content={idea.content} compact />
            </div>
          );
        })}
      </div>
    </div>
  );
}
