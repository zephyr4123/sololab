/** SSE stream event types */

export type SSEEvent =
  | { type: 'text'; content: string }
  | { type: 'agent'; agent: string; action: string }
  | { type: 'tool'; tool: string; result: unknown }
  | { type: 'status'; status: string }
  | { type: 'done'; task_id?: string }
  | { type: 'error'; message: string };

export interface StreamHandlers {
  onText?: (text: string) => void;
  onAgent?: (agent: string, action: string) => void;
  onTool?: (tool: string, result: unknown) => void;
  onStatus?: (status: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  onReconnecting?: () => void;
}
