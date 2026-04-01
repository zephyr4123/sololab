/**
 * OpenCode 直连客户端 — 替代后端 bridge.py + module.py 翻译层。
 *
 * 前端通过 /oc/* 反向代理直接调用 OpenCode Server API，
 * 消除 Backend 中间层的 5-6 层格式转换。
 */

const OC_BASE = '/oc';

// ── 目录路径映射 ────────────────────────────────────

function getWorkspaceDir(): string {
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nd = (window as any).__NEXT_DATA__;
    if (nd?.runtimeConfig?.NEXT_PUBLIC_WORKSPACE_DIR) {
      return nd.runtimeConfig.NEXT_PUBLIC_WORKSPACE_DIR as string;
    }
  }
  return process.env.NEXT_PUBLIC_WORKSPACE_DIR ?? '';
}

/**
 * 将宿主机路径映射为 Docker 容器内 /workspace/ 路径。
 * 本地开发（WORKSPACE_DIR 为空）时原样返回。
 */
export function toContainerPath(hostPath: string): string {
  const ws = getWorkspaceDir();
  if (ws && hostPath.startsWith(ws)) {
    return '/workspace' + hostPath.slice(ws.length);
  }
  return hostPath;
}

// ── REST API ────────────────────────────────────────

async function ocFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${OC_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`OpenCode ${resp.status}: ${text || resp.statusText}`);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

export interface OcSession {
  id: string;
  title: string;
  directory: string;
  parentID?: string;
  time: { created: number; updated: number };
}

export const opencode = {
  /** 创建会话 */
  async createSession(directory: string): Promise<OcSession> {
    const dir = toContainerPath(directory);
    return ocFetch<OcSession>(`/session?directory=${encodeURIComponent(dir)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  /** 列出会话（按目录过滤，排除子会话） */
  async listSessions(directory?: string): Promise<OcSession[]> {
    const params = new URLSearchParams();
    if (directory) params.set('directory', toContainerPath(directory));
    params.set('roots', 'true');
    const sessions = await ocFetch<OcSession[]>(`/session?${params}`);
    return sessions;
  },

  /** 获取消息历史 */
  async getMessages(sessionId: string): Promise<OcMessageWithParts[]> {
    return ocFetch<OcMessageWithParts[]>(`/session/${sessionId}/message`);
  },

  /** 中止执行 */
  async abort(sessionId: string): Promise<void> {
    await ocFetch(`/session/${sessionId}/abort`, { method: 'POST' });
  },

  /** 删除会话 */
  async deleteSession(sessionId: string): Promise<void> {
    await ocFetch(`/session/${sessionId}`, { method: 'DELETE' });
  },

  /** 回复权限请求 */
  async replyPermission(permissionId: string, allowed: boolean): Promise<void> {
    await ocFetch(`/permission/${permissionId}`, {
      method: 'POST',
      body: JSON.stringify({ allowed }),
    });
  },
};

// ── 消息类型 ────────────────────────────────────────

export interface OcMessageInfo {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  agent?: string;
  cost?: number;
  finish?: string;
  time: { created: number; completed?: number };
}

export interface OcMessagePart {
  type: 'text' | 'tool' | 'file' | 'step-start' | 'step-finish';
  id?: string;
  text?: string;
  tool?: string;
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    output?: string;
    title?: string;
    metadata?: Record<string, unknown>;
    time?: { start?: number; end?: number };
  };
}

export interface OcMessageWithParts {
  info: OcMessageInfo;
  parts: OcMessagePart[];
}

// ── SSE 流式处理 ────────────────────────────────────

export interface OpenCodeStreamHandlers {
  onText(delta: string): void;
  onAgent(agent: string, action: 'thinking' | 'idle'): void;
  onToolCall(data: {
    tool: string;
    status: string;
    title: string;
    input: Record<string, unknown>;
    output: string;
    fileDiff?: { file: string; additions: number; deletions: number; before: string; after: string };
    isNewFile?: boolean;
  }): void;
  onParallelTaskStart(taskId: string, agent: string, description: string): void;
  onParallelTaskTool(taskId: string, tool: string, status: string, title: string, input: Record<string, unknown>, output: string): void;
  onParallelTaskText?(taskId: string, content: string): void;
  onParallelTaskDone(taskId: string, summary: string, filesRead: string[], filesModified: string[], errors: string[], timedOut: boolean): void;
  onTitleUpdate?(title: string): void;
  onDone(costUsd: number): void;
  onError(message: string): void;
}

interface ChildSessionInfo {
  agent: string;
  description: string;
}

const MAX_STREAM_MS = 600_000; // 10 min
const READ_TIMEOUT_MS = 60_000; // 60s

/**
 * 发送 prompt 并流式接收 OpenCode 原生 SSE 事件。
 *
 * 1. POST /session/:id/prompt_async（fire & forget）
 * 2. GET /event SSE 流，按 sessionID 过滤
 * 3. 子 session 追踪（并行任务缓冲机制）
 * 4. session.status(idle) 或 session.error 时结束
 */
export async function streamPrompt(
  sessionId: string,
  content: string,
  directory: string,
  handlers: OpenCodeStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const dir = toContainerPath(directory);
  const dirParam = `directory=${encodeURIComponent(dir)}`;

  // 1. 发送 prompt（async，返回 204）
  await ocFetch(`/session/${sessionId}/prompt_async?${dirParam}`, {
    method: 'POST',
    body: JSON.stringify({ parts: [{ type: 'text', text: content }] }),
    signal,
  });

  // 2. 连接 SSE 事件流
  const eventResp = await fetch(`${OC_BASE}/event?${dirParam}`, { signal });
  if (!eventResp.ok || !eventResp.body) {
    handlers.onError(`SSE connection failed: ${eventResp.status}`);
    return;
  }

  const reader = eventResp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let totalCost = 0;
  const streamStart = Date.now();

  // 子 session 并行任务追踪
  const childSessions = new Map<string, ChildSessionInfo>();
  const pendingChildEvents = new Map<string, Array<{ type: string; properties: Record<string, unknown> }>>();

  try {
    while (true) {
      // 总超时检查
      if (Date.now() - streamStart > MAX_STREAM_MS) {
        handlers.onError('Stream timeout after 10 minutes');
        return;
      }

      // 读取超时
      const readPromise = reader.read();
      const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), READ_TIMEOUT_MS),
      );
      const { done, value } = await Promise.race([readPromise, timeoutPromise]);

      if (done && !value) {
        // timeout or stream ended
        if (Date.now() - streamStart < MAX_STREAM_MS) {
          // Didn't hit max timeout — check if real EOF
          break;
        }
        handlers.onError('SSE read timeout');
        return;
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按 \n\n 分割 SSE 事件
      while (buffer.includes('\n\n')) {
        const idx = buffer.indexOf('\n\n');
        const eventStr = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const event = parseSSE(eventStr);
        if (!event) continue;

        const result = handleEvent(
          event, sessionId, childSessions, pendingChildEvents,
          handlers, { total: totalCost },
        );
        totalCost = result.cost;

        if (result.action === 'done') {
          handlers.onDone(totalCost);
          return;
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  // 流正常结束但未收到 idle 信号
  handlers.onDone(totalCost);
}

// ── SSE 解析 ────────────────────────────────────────

function parseSSE(raw: string): { type: string; properties: Record<string, unknown> } | null {
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!dataLines.length) return null;
  try {
    return JSON.parse(dataLines.join('\n'));
  } catch {
    return null;
  }
}

// ── 事件调度（移植自 module.py _translate_event + _handle_chat 子 session 逻辑）──

function handleEvent(
  event: { type: string; properties: Record<string, unknown> },
  parentSid: string,
  childSessions: Map<string, ChildSessionInfo>,
  pendingChildEvents: Map<string, Array<{ type: string; properties: Record<string, unknown> }>>,
  handlers: OpenCodeStreamHandlers,
  costRef: { total: number },
): { action: 'continue' | 'done'; cost: number } {
  const { type: etype, properties: props } = event;
  const evtSid = (props.sessionID as string) ?? '';

  // ── 子 session 事件 ──
  if (evtSid && evtSid !== parentSid) {
    // 累积子 session cost
    if (etype === 'message.updated') {
      const info = props.info as Record<string, unknown> | undefined;
      if (info?.finish && info?.role === 'assistant') {
        costRef.total += (info.cost as number) ?? 0;
      }
    }

    if (childSessions.has(evtSid)) {
      dispatchChildEvent(event, evtSid, handlers);
    } else {
      // 缓存未知子 session 事件
      if (!pendingChildEvents.has(evtSid)) pendingChildEvents.set(evtSid, []);
      pendingChildEvents.get(evtSid)!.push(event);
    }
    return { action: 'continue', cost: costRef.total };
  }

  // ── 父 session 事件 ──

  // 累积 cost
  if (etype === 'message.updated') {
    const info = props.info as Record<string, unknown> | undefined;
    if (info?.finish && info?.role === 'assistant') {
      costRef.total += (info.cost as number) ?? 0;
    }
    // agent 开始思考（无 finish 字段时）
    if (info?.role === 'assistant') {
      const agent = (info.agent as string) ?? '';
      if (!info.finish && agent) {
        handlers.onAgent(agent, 'thinking');
      }
    }
  }

  // 文本流式
  if (etype === 'message.part.delta') {
    const delta = (props.delta as string) ?? '';
    if (delta) handlers.onText(delta);
  }

  // 工具调用 / 并行任务追踪
  if (etype === 'message.part.updated') {
    const part = props.part as Record<string, unknown> | undefined;
    if (!part) return { action: 'continue', cost: costRef.total };

    const partType = part.type as string;

    if (partType === 'tool') {
      const toolName = (part.tool as string) ?? 'unknown';

      // task 工具：管理子 session 生命周期
      if (toolName === 'task') {
        handleTaskTool(part, childSessions, pendingChildEvents, handlers);
        return { action: 'continue', cost: costRef.total };
      }

      // 普通工具调用
      const state = (part.state as Record<string, unknown>) ?? {};
      const metadata = (state.metadata as Record<string, unknown>) ?? {};
      const status = (state.status as string) ?? 'running';
      const output = status === 'completed' ? ((state.output as string) ?? '') : '';

      let fileDiff: { file: string; additions: number; deletions: number; before: string; after: string } | undefined;
      if (status === 'completed' && toolName === 'edit') {
        const fd = metadata.filediff as Record<string, unknown> | undefined;
        if (fd) {
          fileDiff = {
            file: (fd.file as string) ?? '',
            additions: (fd.additions as number) ?? 0,
            deletions: (fd.deletions as number) ?? 0,
            before: (fd.before as string) ?? '',
            after: (fd.after as string) ?? '',
          };
        }
      }

      let isNewFile: boolean | undefined;
      if (status === 'completed' && toolName === 'write') {
        isNewFile = !(metadata.exists as boolean ?? true);
      }

      handlers.onToolCall({
        tool: toolName,
        status,
        title: (state.title as string) ?? toolName,
        input: (state.input as Record<string, unknown>) ?? {},
        output,
        fileDiff,
        isNewFile,
      });
    }

    if (partType === 'step-start') {
      handlers.onAgent('build', 'thinking');
    }
  }

  // Session 完成
  if (etype === 'session.status') {
    const status = props.status as Record<string, unknown> | undefined;
    if (status?.type === 'idle') {
      return { action: 'done', cost: costRef.total };
    }
  }

  // Title 更新
  if (etype === 'session.updated') {
    const info = props.info as Record<string, unknown> | undefined;
    const title = (info?.title as string) ?? '';
    if (title) handlers.onTitleUpdate?.(title);
  }

  // 错误
  if (etype === 'session.error') {
    const errorObj = props.error as Record<string, unknown> | undefined;
    const msg = (errorObj?.data as Record<string, unknown>)?.message as string
      ?? (errorObj?.name as string)
      ?? 'Unknown error';
    handlers.onError(msg);
    return { action: 'done', cost: costRef.total };
  }

  return { action: 'continue', cost: costRef.total };
}

// ── task 工具子 session 管理 ──

function handleTaskTool(
  part: Record<string, unknown>,
  childSessions: Map<string, ChildSessionInfo>,
  pendingChildEvents: Map<string, Array<{ type: string; properties: Record<string, unknown> }>>,
  handlers: OpenCodeStreamHandlers,
) {
  const state = (part.state as Record<string, unknown>) ?? {};
  const metadata = (state.metadata as Record<string, unknown>) ?? {};
  const childSid = (metadata.sessionId as string) ?? '';
  const status = (state.status as string) ?? '';
  const toolInput = (state.input as Record<string, unknown>) ?? {};

  if (status === 'running' && childSid && !childSessions.has(childSid)) {
    // 新子 agent 注册
    const agent = (toolInput.subagent_type as string) ?? 'explore';
    const description = (toolInput.description as string) ?? '';
    childSessions.set(childSid, { agent, description });
    handlers.onParallelTaskStart(childSid, agent, description);

    // Flush 缓存的子 session 事件
    const buffered = pendingChildEvents.get(childSid);
    if (buffered) {
      pendingChildEvents.delete(childSid);
      for (const evt of buffered) {
        dispatchChildEvent(evt, childSid, handlers);
      }
    }
  } else if (status === 'completed' && childSid && childSessions.has(childSid)) {
    const structured = (metadata.structured as Record<string, unknown>) ?? {};
    handlers.onParallelTaskDone(
      childSid,
      (structured.summary as string) ?? '',
      (structured.filesRead as string[]) ?? [],
      (structured.filesModified as string[]) ?? [],
      (structured.errors as string[]) ?? [],
      (metadata.timedOut as boolean) ?? false,
    );
    childSessions.delete(childSid);
    pendingChildEvents.delete(childSid);
  } else if (status === 'error' && childSid && childSessions.has(childSid)) {
    const errorMsg = (state.error as string) ?? 'Task failed';
    handlers.onParallelTaskDone(childSid, '', [], [], [errorMsg], false);
    childSessions.delete(childSid);
    pendingChildEvents.delete(childSid);
  }
}

// ── 子 session 事件转发 ──

function dispatchChildEvent(
  event: { type: string; properties: Record<string, unknown> },
  childSid: string,
  handlers: OpenCodeStreamHandlers,
) {
  const { type: etype, properties: props } = event;

  // 工具调用
  if (etype === 'message.part.updated') {
    const part = props.part as Record<string, unknown> | undefined;
    if (part?.type === 'tool') {
      const toolName = (part.tool as string) ?? 'unknown';
      if (toolName === 'task') return; // 不转发嵌套 task
      const state = (part.state as Record<string, unknown>) ?? {};
      const status = (state.status as string) ?? 'running';
      handlers.onParallelTaskTool(
        childSid,
        toolName,
        status,
        (state.title as string) ?? toolName,
        (state.input as Record<string, unknown>) ?? {},
        status === 'completed' ? ((state.output as string) ?? '') : '',
      );
    }
  }

  // 文本流式
  if (etype === 'message.part.delta') {
    const delta = (props.delta as string) ?? '';
    if (delta) handlers.onParallelTaskText?.(childSid, delta);
  }
}
