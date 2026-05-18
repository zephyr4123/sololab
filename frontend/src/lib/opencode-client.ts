/**
 * OpenCode 直连客户端 — 浏览器侧 SSE 流式适配层。
 *
 * 后端 (`api/codelab.py`) 代理 session CRUD 与 PG 元数据，而 SSE 走这里
 * 直连 OpenCode Server。Next.js rewrite proxy 会缓冲流式响应，因此实时流
 * 必须越过它，直接和 OpenCode 的 `/event` 端点对话。
 *
 * 设计原则：
 *
 * 1. **OpenCode 是只读的事件源**——我们不重新定义 SSE 协议，只 normalize
 *    它的 `message.part.updated` 事件成 store-shaped 数据结构。
 * 2. **父子两条路径对称**——主线程 (parent session) 和子 agent (child
 *    session) 共用 `normalizeOcTool`，所以子 agent 的 fileDiff/isNewFile
 *    不会丢失，前端展示能看到完整 diff。
 * 3. **handler 接口稳定**——CodeLabChat 依赖 8 个回调，本文件保证它们的
 *    语义清晰；任何新增字段都通过 normalize 模块统一供给。
 */

import { normalizeOcTool, type OcToolPart } from '@/components/modules/codelab/shared/normalize';
import type { CodeLabToolCall } from '@/stores/module-stores/codelab-store';

const OC_BASE = process.env.NEXT_PUBLIC_OPENCODE_URL || 'http://localhost:3101';

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

export interface OcSkillEntry {
  name: string;
  description: string;
  location: string;
  content: string;
}

export const opencode = {
  // Session CRUD 已迁移至 Backend 代理 (codelabSessionApi in api-client.ts)
  // 此处保留运行时直连方法：消息历史、中止、skill 全文、权限回复

  /** 获取消息历史（数据在 OpenCode SQLite，直连读取） */
  async getMessages(sessionId: string): Promise<OcMessageWithParts[]> {
    return ocFetch<OcMessageWithParts[]>(`/session/${sessionId}/message`);
  },

  /** 中止执行 */
  async abort(sessionId: string): Promise<void> {
    await ocFetch(`/session/${sessionId}/abort`, { method: 'POST' });
  },

  /**
   * 列出 skill 及其 SKILL.md 全文。
   *
   * 后端代理（codelabSkillApi.list）只返回 name + description（够 SkillPicker 用），
   * 前端 prompt 注入需要 content，所以直接走 OpenCode `/skill` 端点。
   */
  async listSkills(): Promise<OcSkillEntry[]> {
    return ocFetch<OcSkillEntry[]>('/skill');
  },

  /** 回复权限请求（保留接口，permission 流接通时直接调用） */
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
  onToolCall(toolCall: CodeLabToolCall): void;
  onParallelTaskStart(taskId: string, agent: string, description: string): void;
  onParallelTaskTool(taskId: string, toolCall: CodeLabToolCall): void;
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

interface StreamContext {
  parentSid: string;
  handlers: OpenCodeStreamHandlers;
  childSessions: Map<string, ChildSessionInfo>;
  pendingChildEvents: Map<string, Array<RawEvent>>;
  cost: { total: number };
}

interface RawEvent {
  type: string;
  properties: Record<string, unknown>;
}

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

  // 1. 先建立 SSE 连接（避免竞态：prompt_async 发射的事件可能在连接建立前丢失）
  const eventResp = await fetch(`${OC_BASE}/event?${dirParam}`, { signal });
  if (!eventResp.ok || !eventResp.body) {
    handlers.onError(`SSE connection failed: ${eventResp.status}`);
    return;
  }

  const reader = eventResp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const streamStart = Date.now();

  const ctx: StreamContext = {
    parentSid: sessionId,
    handlers,
    childSessions: new Map(),
    pendingChildEvents: new Map(),
    cost: { total: 0 },
  };

  // 2. SSE 连接已建立，现在发送 prompt（事件不会丢失）
  await ocFetch(`/session/${sessionId}/prompt_async?${dirParam}`, {
    method: 'POST',
    body: JSON.stringify({ parts: [{ type: 'text', text: content }] }),
    signal,
  });

  try {
    while (true) {
      if (Date.now() - streamStart > MAX_STREAM_MS) {
        handlers.onError('Stream timeout after 10 minutes');
        return;
      }

      const readPromise = reader.read();
      const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), READ_TIMEOUT_MS),
      );
      const { done, value } = await Promise.race([readPromise, timeoutPromise]);

      if (done && !value) {
        if (Date.now() - streamStart < MAX_STREAM_MS) break;
        handlers.onError('SSE read timeout');
        return;
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (buffer.includes('\n\n')) {
        const idx = buffer.indexOf('\n\n');
        const eventStr = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const event = parseSSE(eventStr);
        if (!event) continue;

        if (handleEvent(event, ctx) === 'done') {
          handlers.onDone(ctx.cost.total);
          return;
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  // 流自然结束（EOF），上报最终 cost
  handlers.onDone(ctx.cost.total);
}

// ── SSE 解析 ────────────────────────────────────────

function parseSSE(raw: string): RawEvent | null {
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

// ── 事件调度 ──

/**
 * Per-event handler. Returns `'done'` if the stream is finished (idle or error),
 * `'continue'` otherwise. Cost accumulation, child-session bookkeeping and
 * tool normalization all funnel through here.
 */
function handleEvent(event: RawEvent, ctx: StreamContext): 'continue' | 'done' {
  const { type: etype, properties: props } = event;
  const evtSid = (props.sessionID as string) ?? '';

  // 子 session 路径：buffer or dispatch
  if (evtSid && evtSid !== ctx.parentSid) {
    accumulateChildCost(etype, props, ctx);
    if (ctx.childSessions.has(evtSid)) {
      dispatchChildEvent(event, evtSid, ctx.handlers);
    } else {
      const buf = ctx.pendingChildEvents.get(evtSid) ?? [];
      buf.push(event);
      ctx.pendingChildEvents.set(evtSid, buf);
    }
    return 'continue';
  }

  // 父 session 路径
  switch (etype) {
    case 'message.updated':       return handleMessageUpdated(props, ctx);
    case 'message.part.delta':    return handleMessagePartDelta(props, ctx);
    case 'message.part.updated':  return handleMessagePartUpdated(props, ctx);
    case 'session.status':        return handleSessionStatus(props);
    case 'session.updated':       return handleSessionUpdated(props, ctx);
    case 'session.error':         return handleSessionError(props, ctx);
    default:                      return 'continue';
  }
}

function accumulateChildCost(etype: string, props: Record<string, unknown>, ctx: StreamContext): void {
  if (etype !== 'message.updated') return;
  const info = props.info as Record<string, unknown> | undefined;
  if (info?.finish && info?.role === 'assistant') {
    ctx.cost.total += (info.cost as number) ?? 0;
  }
}

function handleMessageUpdated(props: Record<string, unknown>, ctx: StreamContext): 'continue' {
  const info = props.info as Record<string, unknown> | undefined;
  if (!info) return 'continue';

  if (info.finish && info.role === 'assistant') {
    ctx.cost.total += (info.cost as number) ?? 0;
  }
  if (info.role === 'assistant' && !info.finish) {
    const agent = (info.agent as string) ?? '';
    if (agent) ctx.handlers.onAgent(agent, 'thinking');
  }
  return 'continue';
}

function handleMessagePartDelta(props: Record<string, unknown>, ctx: StreamContext): 'continue' {
  const delta = (props.delta as string) ?? '';
  if (delta) ctx.handlers.onText(delta);
  return 'continue';
}

function handleMessagePartUpdated(props: Record<string, unknown>, ctx: StreamContext): 'continue' {
  const part = props.part as Record<string, unknown> | undefined;
  if (!part) return 'continue';

  const partType = part.type as string;

  if (partType === 'tool') {
    const toolName = (part.tool as string) ?? 'unknown';
    if (toolName === 'task') {
      handleTaskTool(part as OcToolPart, ctx);
      return 'continue';
    }
    ctx.handlers.onToolCall(normalizeOcTool(part as OcToolPart, (part.id as string) || undefined));
  }
  // step-start 故意不在这里设 agent —— 真实 agent 名来自 message.updated.info.agent。
  // 旧版本曾 hardcode 'build'，造成在 explore/plan 运行时 badge 闪回 build。
  return 'continue';
}

function handleSessionStatus(props: Record<string, unknown>): 'continue' | 'done' {
  const status = props.status as Record<string, unknown> | undefined;
  return status?.type === 'idle' ? 'done' : 'continue';
}

function handleSessionUpdated(props: Record<string, unknown>, ctx: StreamContext): 'continue' {
  const info = props.info as Record<string, unknown> | undefined;
  const title = (info?.title as string) ?? '';
  if (title) ctx.handlers.onTitleUpdate?.(title);
  return 'continue';
}

function handleSessionError(props: Record<string, unknown>, ctx: StreamContext): 'done' {
  const errorObj = props.error as Record<string, unknown> | undefined;
  const data = errorObj?.data as Record<string, unknown> | undefined;
  const msg = (data?.message as string) ?? (errorObj?.name as string) ?? 'Unknown error';
  ctx.handlers.onError(msg);
  return 'done';
}

// ── task 工具子 session 管理 ──

function handleTaskTool(part: OcToolPart, ctx: StreamContext): void {
  const state = part.state ?? {};
  const metadata = state.metadata ?? {};
  const childSid = (metadata.sessionId as string) ?? '';
  const status = state.status ?? '';
  const toolInput = state.input ?? {};

  if (!childSid) return;

  if (status === 'running' && !ctx.childSessions.has(childSid)) {
    const agent = (toolInput.subagent_type as string) ?? 'explore';
    const description = (toolInput.description as string) ?? '';
    ctx.childSessions.set(childSid, { agent, description });
    ctx.handlers.onParallelTaskStart(childSid, agent, description);

    // Flush buffered child events (events that arrived before the task tool reached running)
    const buffered = ctx.pendingChildEvents.get(childSid);
    if (buffered) {
      ctx.pendingChildEvents.delete(childSid);
      for (const evt of buffered) {
        dispatchChildEvent(evt, childSid, ctx.handlers);
      }
    }
    return;
  }

  if (status === 'completed' && ctx.childSessions.has(childSid)) {
    const structured = (metadata.structured as Record<string, unknown>) ?? {};
    ctx.handlers.onParallelTaskDone(
      childSid,
      (structured.summary as string) ?? '',
      (structured.filesRead as string[]) ?? [],
      (structured.filesModified as string[]) ?? [],
      (structured.errors as string[]) ?? [],
      (metadata.timedOut as boolean) ?? false,
    );
    ctx.childSessions.delete(childSid);
    ctx.pendingChildEvents.delete(childSid);
    return;
  }

  if (status === 'error' && ctx.childSessions.has(childSid)) {
    const errorMsg = ((state as Record<string, unknown>).error as string) ?? 'Task failed';
    ctx.handlers.onParallelTaskDone(childSid, '', [], [], [errorMsg], false);
    ctx.childSessions.delete(childSid);
    ctx.pendingChildEvents.delete(childSid);
  }
}

// ── 子 session 事件转发 ──
// 子 agent 的工具调用通过 normalize 同入口流出 —— fileDiff/isNewFile 在
// 父子两条路径上对称提取，因此 explore/build 子 agent 修改的文件在 ForkSpoke
// 里也能完整渲染 diff。

function dispatchChildEvent(event: RawEvent, childSid: string, handlers: OpenCodeStreamHandlers): void {
  const { type: etype, properties: props } = event;
  if (etype !== 'message.part.updated') return;

  const part = props.part as Record<string, unknown> | undefined;
  if (part?.type !== 'tool') return;

  const toolName = (part.tool as string) ?? 'unknown';
  if (toolName === 'task') return; // 不转发嵌套 task（OpenCode 当前不会嵌套，预防性 guard）

  handlers.onParallelTaskTool(
    childSid,
    normalizeOcTool(part as OcToolPart, (part.id as string) || undefined),
  );
}
