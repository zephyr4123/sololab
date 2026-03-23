'use client';

import { useState, useCallback } from 'react';
import { MessageSquare, Lightbulb, FileText } from 'lucide-react';
import { ChatPanel } from '@/components/shared/ChatPanel';
import { ConversationHistory } from '@/components/shared/ConversationHistory';
import { IdeaBoard } from '@/components/modules/ideaspark/IdeaBoard';
import { IdeaReport } from '@/components/modules/ideaspark/IdeaReport';

interface ModuleContainerProps {
  moduleId: string;
}

type TabId = 'chat' | 'board' | 'report';

const tabs: { id: TabId; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat', label: '对话', icon: MessageSquare },
  { id: 'board', label: '创意', icon: Lightbulb },
  { id: 'report', label: '报告', icon: FileText },
];

export function ModuleContainer({ moduleId }: ModuleContainerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  // Track which tabs have been visited — only mount after first visit
  const [visited, setVisited] = useState<Set<TabId>>(new Set(['chat']));

  const switchTab = useCallback((id: TabId) => {
    setActiveTab(id);
    setVisited(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex h-full min-h-0 gap-4">
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {/* Tab bar */}
        <div className="mb-3 flex gap-1 rounded-lg bg-muted/50 p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content — lazy mount on first visit, then keep mounted via CSS hidden */}
        <div className={activeTab === 'chat' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
          <ChatPanel moduleId={moduleId} />
        </div>
        {visited.has('board') && (
          <div className={activeTab === 'board' ? 'flex-1 min-h-0 overflow-y-auto p-2' : 'hidden'}>
            <IdeaBoard />
          </div>
        )}
        {visited.has('report') && (
          <div className={activeTab === 'report' ? 'flex-1 min-h-0 overflow-y-auto p-2' : 'hidden'}>
            <IdeaReport />
          </div>
        )}
      </div>

      {/* Right sidebar: Conversation History */}
      <aside className="hidden w-72 min-h-0 border-l pl-4 xl:block">
        <ConversationHistory moduleId={moduleId} />
      </aside>
    </div>
  );
}
