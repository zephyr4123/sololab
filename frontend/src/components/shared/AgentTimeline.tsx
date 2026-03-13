'use client';

interface AgentTimelineProps {
  moduleId: string;
}

interface TimelineEvent {
  agent: string;
  action: string;
  timestamp: string;
}

export function AgentTimeline({ moduleId }: AgentTimelineProps) {
  // TODO: 从任务 store 订阅智能体事件
  const events: TimelineEvent[] = [];

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No agent activity yet. Start a task to see agents in action.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((event, i) => (
        <div key={i} className="flex gap-3 text-sm">
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
          <div>
            <span className="font-medium">{event.agent}</span>
            <p className="text-muted-foreground">{event.action}</p>
            <time className="text-xs text-muted-foreground">{event.timestamp}</time>
          </div>
        </div>
      ))}
    </div>
  );
}
