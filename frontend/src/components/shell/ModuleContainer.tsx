'use client';

import { useState, useCallback } from 'react';
import { MessageSquare, Lightbulb, FileText } from 'lucide-react';
import { ChatPanel } from '@/components/shared/ChatPanel';
import { ConversationHistory } from '@/components/shared/ConversationHistory';
import { DocumentManager } from '@/components/shared/DocumentManager';
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
  const [visited, setVisited] = useState<Set<TabId>>(new Set<TabId>(['chat']));

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
    <div className="flex h-full min-h-0 gap-5">
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {/* Tab bar — elegant underline style */}
        <div className="mb-4 flex items-center gap-1 border-b border-border/50">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-4 pb-2.5 pt-1 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground/60 hover:text-muted-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {/* Active indicator — warm underline */}
                {isActive && (
                  <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[var(--color-warm)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
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

      {/* Right sidebar */}
      <aside className="hidden w-72 min-h-0 overflow-y-auto border-l border-border/40 pl-5 xl:block space-y-6">
        <ConversationHistory moduleId={moduleId} />
        <div className="border-t border-border/30 pt-5">
          <DocumentManager />
        </div>
      </aside>
    </div>
  );
}
