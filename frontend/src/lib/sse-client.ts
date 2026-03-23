/**
 * 弹性 SSE 客户端，支持自动断线恢复。
 */

import type { SSEEvent, StreamHandlers } from '@/types/stream';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export class ResilientSSEClient {
  private taskId: string | null = null;
  private lastEventId = 0;
  private abortController: AbortController | null = null;
  private maxRetries = 3;

  private sessionId: string | null = null;

  async start(moduleId: string, input: string, params: Record<string, unknown>, handlers: StreamHandlers, sessionId?: string) {
    this.abortController = new AbortController();
    try {
      const response = await fetch(`${API_BASE}/api/modules/${moduleId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, params, session_id: sessionId }),
        signal: this.abortController.signal,
      });
      await this.consumeStream(response, handlers);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      await this.recover(handlers);
    }
  }

  private async consumeStream(response: Response, handlers: StreamHandlers) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('id: ')) {
          this.lastEventId = parseInt(line.slice(4), 10);
          continue;
        }
        if (!line.startsWith('data: ')) continue;

        const event = JSON.parse(line.slice(6)) as SSEEvent & { task_id?: string; session_id?: string };
        if (event.task_id) this.taskId = event.task_id;
        if (event.session_id) this.sessionId = event.session_id;
        this.dispatchEvent(event, handlers);
        if (event.type === 'done' || event.type === 'error') return;
      }
    }
  }

  private async recover(handlers: StreamHandlers, retryCount = 0) {
    if (!this.taskId || retryCount >= this.maxRetries) {
      handlers.onError?.('Connection lost and recovery failed');
      return;
    }
    handlers.onReconnecting?.();
    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retryCount)));

    try {
      const stateRes = await fetch(`${API_BASE}/api/tasks/${this.taskId}/state`);
      const state = await stateRes.json();

      if (state.status === 'completed' || state.status === 'running') {
        const eventsRes = await fetch(`${API_BASE}/api/tasks/${this.taskId}/events?after=${this.lastEventId}`);
        const { events } = await eventsRes.json();
        for (const event of events) {
          this.lastEventId = event.event_id;
          this.dispatchEvent(event, handlers);
        }
        if (state.status === 'completed') {
          handlers.onDone?.();
          return;
        }
        const resumeRes = await fetch(`${API_BASE}/api/tasks/${this.taskId}/resume`, {
          method: 'POST',
          signal: this.abortController?.signal,
        });
        await this.consumeStream(resumeRes, handlers);
      }
    } catch {
      await this.recover(handlers, retryCount + 1);
    }
  }

  private dispatchEvent(event: SSEEvent, handlers: StreamHandlers) {
    switch (event.type) {
      case 'task_created': handlers.onTaskCreated?.((event as any).session_id); break;
      case 'text': handlers.onText?.(event.content); break;
      case 'agent': handlers.onAgent?.(event.agent, event.action, event.content, event.message_count); break;
      case 'tool': handlers.onTool?.(event); break;
      case 'status': handlers.onStatus?.(event.phase || event.status || '', event.round); break;
      case 'idea': handlers.onIdea?.(event.id, event.content, event.author); break;
      case 'vote': handlers.onVote?.(event.idea_id, event.content, event.author, event.elo_score, event.rank); break;
      case 'done': handlers.onDone?.(event.top_ideas, event.cost_usd); break;
      case 'error': handlers.onError?.(event.message || event.error || 'Unknown error'); break;
    }
  }

  stop() {
    this.abortController?.abort();
  }
}
