'use client';

import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';

const AGENT_COLORS: Record<string, string> = {
  divergent: 'bg-purple-500',
  expert: 'bg-blue-500',
  critic: 'bg-red-500',
  connector: 'bg-green-500',
  evaluator: 'bg-yellow-500',
};

export function AgentTimeline() {
  const { agentEvents } = useIdeaSparkStore();

  if (agentEvents.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        Agent activity will appear here
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2 max-h-64 overflow-auto">
      {agentEvents.map((event, idx) => {
        const color = AGENT_COLORS[event.agent] || 'bg-gray-500';
        const time = new Date(event.timestamp).toLocaleTimeString();
        return (
          <div key={idx} className="flex items-start gap-2 text-xs">
            <div className={`mt-1 h-2 w-2 rounded-full ${color} shrink-0`} />
            <div className="flex-1 min-w-0">
              <span className="font-medium capitalize">{event.agent}</span>
              <span className="text-muted-foreground"> {event.action}</span>
              {event.content && (
                <p className="text-muted-foreground truncate">{event.content}</p>
              )}
            </div>
            <span className="text-muted-foreground shrink-0">{time}</span>
          </div>
        );
      })}
    </div>
  );
}
