/** SSE 流式事件类型 */

export type SSEEvent =
  | { type: 'text'; content: string }
  | { type: 'agent'; agent: string; action: string; content?: string; message_count?: number }
  | { type: 'tool'; tool: string; result: unknown }
  | { type: 'status'; phase?: string; round?: number; status?: string; [key: string]: unknown }
  | { type: 'idea'; id: string; content: string; author: string }
  | { type: 'vote'; idea_id: string; content: string; author: string; elo_score: number; rank: number; round: number }
  | { type: 'task_created'; task_id: string }
  | { type: 'done'; top_ideas?: Array<{ id: string; content: string; author: string; elo_score: number }>; cost_usd?: number }
  | { type: 'error'; message?: string; error?: string };

export interface StreamHandlers {
  onText?: (text: string) => void;
  onAgent?: (agent: string, action: string, content?: string, messageCount?: number) => void;
  onTool?: (tool: string, result: unknown) => void;
  onStatus?: (phase: string, round?: number) => void;
  onIdea?: (id: string, content: string, author: string) => void;
  onVote?: (ideaId: string, content: string, author: string, eloScore: number, rank: number) => void;
  onDone?: (topIdeas?: Array<{ id: string; content: string; author: string; elo_score: number }>, costUsd?: number) => void;
  onError?: (message: string) => void;
  onReconnecting?: () => void;
}
