/**
 * IdeaSpark module plugin registration.
 * Migrates the existing IdeaSpark module into the hot-plug architecture.
 */

import { registerPlugin } from '@/lib/module-loader';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useTaskStore } from '@/stores/task-store';
import type { StreamHandlers } from '@/types/stream';

// Lazy imports for tab components
import { ChatPanel } from '@/components/shared/ChatPanel';
import { IdeaBoard } from './IdeaBoard';
import { IdeaReport } from './IdeaReport';
import { ProcessSidebar } from './ProcessSidebar';

// Sidebar components
import { ConversationHistory } from '@/components/shared/ConversationHistory';
import { DocumentManager } from '@/components/shared/DocumentManager';

/** Compose the right sidebar for IdeaSpark */
function IdeaSparkSidebar({ moduleId }: { moduleId: string }) {
  return (
    <>
      <ProcessSidebar />
      <div className="border-t border-border/30 pt-5">
        <ConversationHistory moduleId={moduleId} />
      </div>
      <div className="border-t border-border/30 pt-5">
        <DocumentManager />
      </div>
    </>
  );
}

registerPlugin('ideaspark', {
  tabs: [
    { id: 'chat', label: '对话', icon: 'MessageSquare', component: ChatPanel },
    { id: 'board', label: '创意', icon: 'Lightbulb', component: IdeaBoard },
    { id: 'report', label: '报告', icon: 'FileText', component: IdeaReport },
  ],

  sidebar: { component: IdeaSparkSidebar },

  // Bind active tab to ideaspark-store so onDone can auto-switch to 'board'
  useTabController() {
    const activeTab = useIdeaSparkStore((s) => s.activeTab);
    const setActiveTab = useIdeaSparkStore((s) => s.setActiveTab);
    return {
      activeTab,
      setActiveTab: (id: string) => setActiveTab(id as 'chat' | 'board' | 'report'),
    };
  },

  createStreamHandlers(): Partial<StreamHandlers> {
    const spark = useIdeaSparkStore.getState();
    return {
      onStatus(phase, round) {
        spark.setPhase(phase as any);
        if (round !== undefined) spark.setRound(round);
      },
      onIdea(id, content, author) {
        spark.addIdea({ id, content, author, eloScore: 0 });
      },
      onVote(_ideaId, content, author, eloScore, rank) {
        const round = useIdeaSparkStore.getState().currentRound;
        spark.setTopIdeas([
          ...useIdeaSparkStore.getState().topIdeas,
          { id: _ideaId, content, author, eloScore, rank, round },
        ]);
      },
      onDone(topIdeas, costUsd) {
        const round = useIdeaSparkStore.getState().currentRound;
        if (topIdeas) spark.setTopIdeas(topIdeas.map((i, idx) => ({ ...i, eloScore: i.elo_score, rank: idx + 1, round })));
        if (costUsd !== undefined) spark.setCostUsd(costUsd);
      },
    };
  },

  reset() {
    useIdeaSparkStore.getState().reset();
    useTaskStore.getState().reset();
  },
});
