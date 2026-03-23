'use client';

import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { Trophy, DollarSign } from 'lucide-react';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

export function VoteResult() {
  const { topIdeas, costUsd, phase } = useIdeaSparkStore();

  if (phase !== 'done' || topIdeas.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 p-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Tournament Results</h3>
        {costUsd > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3" /> ${costUsd.toFixed(4)}
          </span>
        )}
      </div>
      <div className="space-y-3">
        {topIdeas.map((idea, idx) => (
          <div key={idea.id} className={`rounded-lg border p-4 ${idx === 0 ? 'border-yellow-400 bg-yellow-50/50' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
              <Trophy className={`h-4 w-4 ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : 'text-orange-400'}`} />
              <span className="font-bold text-sm">#{idx + 1}</span>
              <span className="text-xs text-muted-foreground capitalize">by {idea.author}</span>
              <span className="ml-auto text-xs font-mono">Elo: {Math.round(idea.eloScore)}</span>
            </div>
            <MarkdownViewer content={idea.content} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
