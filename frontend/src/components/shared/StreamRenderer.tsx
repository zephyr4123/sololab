'use client';

import { useEffect, useState } from 'react';
import type { SSEEvent } from '@/types/stream';

interface StreamRendererProps {
  moduleId: string;
  taskId: string | null;
  onEvent?: (event: SSEEvent) => void;
}

export function StreamRenderer({ moduleId, taskId, onEvent }: StreamRendererProps) {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'reconnecting' | 'done'>('idle');

  useEffect(() => {
    if (!taskId) return;
    // TODO: 通过 ResilientSSEClient 连接 SSE 流
    setStatus('streaming');
    return () => setStatus('idle');
  }, [taskId, moduleId]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${
          status === 'streaming' ? 'bg-green-500 animate-pulse' :
          status === 'reconnecting' ? 'bg-yellow-500 animate-pulse' :
          status === 'done' ? 'bg-blue-500' : 'bg-gray-300'
        }`} />
        {status}
      </div>
      {events.map((event, i) => (
        <div key={i} className="text-sm">
          <span className="text-muted-foreground">[{event.type}]</span>{' '}
          {'content' in event ? event.content : JSON.stringify(event)}
        </div>
      ))}
    </div>
  );
}
