'use client';

import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { Trophy } from 'lucide-react';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

export function IdeaBoard() {
  const { ideas, topIdeas, phase } = useIdeaSparkStore();
  const displayIdeas = topIdeas.length > 0 ? topIdeas : ideas;

  if (displayIdeas.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        {phase === 'idle' ? 'Submit a topic to generate ideas' : 'Generating ideas...'}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-2">
      <h3 className="text-sm font-semibold text-muted-foreground">
        {topIdeas.length > 0 ? `Top ${topIdeas.length} Ideas` : `${ideas.length} Ideas Generated`}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {displayIdeas.map((idea) => (
          <div key={idea.id} className="rounded-lg border p-4 space-y-2 hover:border-primary transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground capitalize">{idea.author}</span>
              {idea.rank && (
                <span className="flex items-center gap-1 text-xs font-bold text-yellow-600">
                  <Trophy className="h-3 w-3" /> #{idea.rank}
                </span>
              )}
            </div>
            <MarkdownViewer content={idea.content} compact />
            {idea.eloScore > 0 && idea.eloScore !== 1500 && (
              <div className="text-xs text-muted-foreground">
                Elo: {Math.round(idea.eloScore)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
