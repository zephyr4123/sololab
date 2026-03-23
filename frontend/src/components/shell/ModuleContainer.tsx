'use client';

import { useState } from 'react';
import { ChatPanel } from '@/components/shared/ChatPanel';
import { AgentTimeline } from '@/components/shared/AgentTimeline';
import { AgentPanel } from '@/components/modules/ideaspark/AgentPanel';
import { IdeaBoard } from '@/components/modules/ideaspark/IdeaBoard';
import { VoteResult } from '@/components/modules/ideaspark/VoteResult';
import { IdeaReport } from '@/components/modules/ideaspark/IdeaReport';

interface ModuleContainerProps {
  moduleId: string;
}

type TabId = 'chat' | 'board' | 'detail' | 'report';

export function ModuleContainer({ moduleId }: ModuleContainerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('chat');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'chat', label: '对话' },
    { id: 'board', label: '创意' },
    { id: 'detail', label: '结果' },
    { id: 'report', label: '报告' },
  ];

  return (
    <div className="flex h-full min-h-0 gap-4">
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        <div className="mb-4 flex gap-1 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'chat' && <ChatPanel moduleId={moduleId} />}
        {activeTab === 'board' && <IdeaBoard />}
        {activeTab === 'detail' && <VoteResult />}
        {activeTab === 'report' && <IdeaReport />}
      </div>

      <aside className="hidden w-80 min-h-0 overflow-y-auto space-y-6 border-l pl-4 xl:block">
        <AgentPanel />
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">活动日志</h3>
          <AgentTimeline />
        </div>
      </aside>
    </div>
  );
}
