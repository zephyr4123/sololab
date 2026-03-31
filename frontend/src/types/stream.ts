/** SSE 流式事件类型 */

export type SSEEvent =
  | { type: 'text'; content: string }
  | { type: 'agent'; agent: string; action: string; content?: string; message_count?: number }
  | { type: 'tool'; tool: string; agent?: string; query?: string; original_query?: string; success?: boolean; result_preview?: string; result_count?: number; results?: Array<{ title: string; url: string; snippet: string }>; error?: string | null; result?: unknown; status?: string; input?: Record<string, unknown>; output?: string; title?: string }
  | { type: 'status'; phase?: string; round?: number; status?: string; [key: string]: unknown }
  | { type: 'idea'; id: string; content: string; author: string }
  | { type: 'vote'; idea_id: string; content: string; author: string; elo_score: number; rank: number; round: number }
  | { type: 'task_created'; task_id: string; session_id?: string }
  | { type: 'done'; top_ideas?: Array<{ id: string; content: string; author: string; elo_score: number }>; cost_usd?: number }
  | { type: 'error'; message?: string; error?: string }
  /* ── Parallel Task Events (子 agent 可视化) ── */
  | { type: 'parallel_task_start'; task_id: string; agent: string; description: string }
  | { type: 'parallel_task_tool'; task_id: string; tool: string; status: string; title?: string; input?: Record<string, unknown>; output?: string }
  | { type: 'parallel_task_text'; task_id: string; content: string }
  | { type: 'parallel_task_done'; task_id: string; summary?: string; files_read?: string[]; files_modified?: string[]; errors?: string[]; timed_out?: boolean; status?: string };

export interface StreamHandlers {
  onTaskCreated?: (sessionId?: string) => void;
  onText?: (text: string) => void;
  onAgent?: (agent: string, action: string, content?: string, messageCount?: number) => void;
  onTool?: (event: SSEEvent & { type: 'tool' }) => void;
  onStatus?: (phase: string, round?: number) => void;
  onIdea?: (id: string, content: string, author: string) => void;
  onVote?: (ideaId: string, content: string, author: string, eloScore: number, rank: number) => void;
  onDone?: (topIdeas?: Array<{ id: string; content: string; author: string; elo_score: number }>, costUsd?: number) => void;
  onError?: (message: string) => void;
  onReconnecting?: () => void;
  /* ── Parallel Task Handlers ── */
  onParallelTaskStart?: (taskId: string, agent: string, description: string) => void;
  onParallelTaskTool?: (taskId: string, tool: string, status: string, title?: string, input?: Record<string, unknown>, output?: string) => void;
  onParallelTaskText?: (taskId: string, content: string) => void;
  onParallelTaskDone?: (taskId: string, summary?: string, filesRead?: string[], filesModified?: string[], errors?: string[], timedOut?: boolean) => void;
}
