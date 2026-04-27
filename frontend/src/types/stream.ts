/** SSE 流式事件类型 */

export type SSEEvent =
  | { type: 'text'; content: string }
  | { type: 'agent'; agent: string; action: string; content?: string; message_count?: number; group_idx?: number; iteration?: number }
  | { type: 'tool'; tool: string; agent?: string; query?: string; original_query?: string; success?: boolean; result_preview?: string; result_count?: number; results?: Array<{ title: string; url: string; snippet: string }>; error?: string | null; result?: unknown; status?: string; input?: Record<string, unknown>; output?: string; title?: string; fileDiff?: { file: string; additions: number; deletions: number; before: string; after: string }; isNewFile?: boolean; group_idx?: number; iteration?: number }
  | { type: 'status'; phase?: string; round?: number; status?: string; [key: string]: unknown }
  | { type: 'idea'; id: string; content: string; author: string }
  | { type: 'agent_reasoning_delta'; agent: string; delta: string; group_idx?: number; iteration?: number }
  | { type: 'agent_content_delta'; agent: string; delta: string; group_idx?: number; iteration?: number }
  | { type: 'tool_call_started'; agent: string; tool: string; tool_id?: string; query?: string; group_idx?: number; iteration?: number }
  | { type: 'cluster_groups'; round: number; groups: Array<Array<{ id: string; author: string; preview: string }>> }
  | { type: 'evaluate_match'; round: number; a_id: string; a_author: string; a_preview: string; a_elo: number; b_id: string; b_author: string; b_preview: string; b_elo: number; winner: string }
  | { type: 'vote'; idea_id: string; content: string; author: string; elo_score: number; rank: number; round: number }
  | { type: 'task_created'; task_id: string; session_id?: string }
  | { type: 'done'; top_ideas?: Array<{ id: string; content: string; author: string; elo_score: number }>; cost_usd?: number }
  | { type: 'error'; message?: string; error?: string }
  /* ── Parallel Task Events (子 agent 可视化) ── */
  | { type: 'parallel_task_start'; task_id: string; agent: string; description: string }
  | { type: 'parallel_task_tool'; task_id: string; tool: string; status: string; title?: string; input?: Record<string, unknown>; output?: string }
  | { type: 'parallel_task_text'; task_id: string; content: string }
  | { type: 'parallel_task_done'; task_id: string; summary?: string; files_read?: string[]; files_modified?: string[]; errors?: string[]; timed_out?: boolean; status?: string }
  /* ── WriterAI Events ── */
  | { type: 'outline_created'; doc_id?: string; title?: string; template_id?: string; sections: Array<{ id: string; type: string; title: string }> }
  | { type: 'section_start'; section_id: string; title: string }
  | { type: 'section_stream'; section_id: string; delta: string }
  | { type: 'section_complete'; section_id: string; word_count: number }
  | { type: 'section_content_updated'; section_id: string; content: string }
  | { type: 'reference_added'; reference: { number: number; title: string; authors?: string[]; year?: number; venue?: string; doi?: string; url?: string } }
  | { type: 'reference_removed'; ref_number: number }
  | { type: 'figure_created'; figure: { id: string; section_id?: string; caption: string; url: string; number?: number } }
  | { type: 'code_executing'; description?: string; language?: string }
  | { type: 'search_results'; tool: string; query: string; result_count: number; results: Array<{ title: string; authors: string[]; year: number | null; venue: string; url: string; abstract: string; source: string }> };

export interface StreamHandlers {
  onTaskCreated?: (sessionId?: string) => void;
  onText?: (text: string) => void;
  // 第 5 个 event 参数 = 完整事件对象，用来透传 group_idx / iteration 等附加字段
  // 多组并行的 together_phase 必须靠它分组
  onAgent?: (agent: string, action: string, content?: string, messageCount?: number, event?: SSEEvent & { type: 'agent' }) => void;
  onTool?: (event: SSEEvent & { type: 'tool' }) => void;
  onStatus?: (phase: string, round?: number) => void;
  onIdea?: (id: string, content: string, author: string) => void;
  onAgentReasoningDelta?: (agent: string, delta: string, event?: SSEEvent & { type: 'agent_reasoning_delta' }) => void;
  onAgentContentDelta?: (agent: string, delta: string, event?: SSEEvent & { type: 'agent_content_delta' }) => void;
  onToolCallStarted?: (agent: string, tool: string, query?: string, toolId?: string, event?: SSEEvent & { type: 'tool_call_started' }) => void;
  onClusterGroups?: (event: SSEEvent & { type: 'cluster_groups' }) => void;
  onEvaluateMatch?: (event: SSEEvent & { type: 'evaluate_match' }) => void;
  onVote?: (ideaId: string, content: string, author: string, eloScore: number, rank: number) => void;
  onDone?: (topIdeas?: Array<{ id: string; content: string; author: string; elo_score: number }>, costUsd?: number) => void;
  onError?: (message: string) => void;
  onReconnecting?: () => void;
  /* ── Parallel Task Handlers ── */
  onParallelTaskStart?: (taskId: string, agent: string, description: string) => void;
  onParallelTaskTool?: (taskId: string, tool: string, status: string, title?: string, input?: Record<string, unknown>, output?: string) => void;
  onParallelTaskText?: (taskId: string, content: string) => void;
  onParallelTaskDone?: (taskId: string, summary?: string, filesRead?: string[], filesModified?: string[], errors?: string[], timedOut?: boolean) => void;
  /* ── WriterAI Handlers ── */
  onOutlineCreated?: (event: SSEEvent & { type: 'outline_created' }) => void;
  onSectionStart?: (sectionId: string, title: string) => void;
  onSectionStream?: (sectionId: string, delta: string) => void;
  onSectionComplete?: (sectionId: string, wordCount: number) => void;
  onSectionContentUpdated?: (sectionId: string, content: string) => void;
  onReferenceAdded?: (ref: { number: number; title: string; authors?: string[]; year?: number; venue?: string }) => void;
  onReferenceRemoved?: (refNumber: number) => void;
  onFigureCreated?: (figure: { id: string; section_id?: string; caption: string; url: string; number?: number }) => void;
  onCodeExecuting?: (description?: string) => void;
  onSearchResults?: (event: SSEEvent & { type: 'search_results' }) => void;
}
