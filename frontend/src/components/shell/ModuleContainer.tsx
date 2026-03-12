'use client';

import { useState } from 'react';
import { ChatPanel } from '@/components/shared/ChatPanel';
import { AgentTimeline } from '@/components/shared/AgentTimeline';

interface ModuleContainerProps {
  moduleId: string;
}

type TabId = 'chat' | 'board' | 'detail';

export function ModuleContainer({ moduleId }: ModuleContainerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('chat');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'chat', label: 'Chat' },
    { id: 'board', label: 'Board' },
    { id: 'detail', label: 'Detail' },
  ];

  return (
    <div className="flex h-full gap-4">
      <div className="flex flex-1 flex-col">
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
        {activeTab === 'board' && (
          <div className="flex-1 p-4 text-muted-foreground">Board view coming soon</div>
        )}
        {activeTab === 'detail' && (
          <div className="flex-1 p-4 text-muted-foreground">Detail view coming soon</div>
        )}
      </div>

      <aside className="hidden w-80 border-l pl-4 xl:block">
        <h3 className="mb-3 text-sm font-semibold">Agent Activity</h3>
        <AgentTimeline moduleId={moduleId} />
      </aside>
    </div>
  );
}
