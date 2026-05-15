/**
 * codelab-store — single source of truth for the CodeLab working surface.
 *
 * Shape:
 *   workingDirectory + recentDirectories   ← persisted via localStorage
 *   sessionId                              ← current OpenCode session
 *   messages: CodeLabMessage[]             ← interleaved user / assistant
 *     parts: MessagePart[] (text | tool | parallel-tasks)
 *   files: CodeLabFile[]                   ← seen / touched files this round
 *   currentAgent + agentStatus             ← derived from SSE
 *   costUsd                                ← accumulated across sessions
 *
 * One opinionated rule worth knowing:
 *   `addFile` *protects* write states from being overwritten by reads. If the
 *   user asks the LLM to read a file it just edited, the sidebar still shows
 *   ✎ (modified). Read-state only fills *new* entries.
 *
 * Cancellation semantics:
 *   `finalizeStreamingMessage` is the single entry point for "the stream is
 *   over, whatever's running should look completed." It walks the last
 *   assistant message and flips every running tool/parallel-task → completed,
 *   and the containing parallel-task group's status accordingly. Used by
 *   stop / abort / error / unmount alike.
 */

import { create } from 'zustand';

/* ── Types ── */

export interface CodeLabFile {
  path: string;
  status: 'read' | 'modified' | 'created' | 'deleted';
}

export interface FileDiff {
  file: string;
  additions: number;
  deletions: number;
  before: string;
  after: string;
}

export interface CodeLabToolCall {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  title?: string;
  timestamp: number;
  fileDiff?: FileDiff;
  isNewFile?: boolean;
}

export interface ParallelTaskInfo {
  id: string;
  sessionId: string;
  agent: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'timeout';
  startTime: number;
  endTime?: number;
  toolCalls: CodeLabToolCall[];
  summary?: string;
}

export interface ParallelTaskGroup {
  id: string;
  parentToolCallId: string;
  tasks: ParallelTaskInfo[];
  startTime: number;
  status: 'running' | 'completed' | 'partial';
}

export type MessagePart =
  | { kind: 'text'; content: string }
  | { kind: 'tool'; toolCall: CodeLabToolCall }
  | { kind: 'parallel-tasks'; group: ParallelTaskGroup };

export interface CodeLabMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts: MessagePart[];
  timestamp: number;
}

/* ── State + actions ── */

interface CodeLabState {
  /* Project */
  workingDirectory: string | null;
  recentDirectories: string[];
  setWorkingDirectory: (dir: string) => void;
  leaveDirectory: () => void;
  removeRecentDirectory: (dir: string) => void;

  /* Session */
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  sessionListVersion: number;
  bumpSessionList: () => void;
  isStreaming: boolean;
  setStreaming: (v: boolean) => void;

  /* Messages */
  messages: CodeLabMessage[];
  addMessage: (msg: CodeLabMessage) => void;
  setMessages: (msgs: CodeLabMessage[]) => void;
  appendToLastMessage: (text: string) => void;

  /* Files */
  files: CodeLabFile[];
  addFile: (f: CodeLabFile) => void;
  setFiles: (f: CodeLabFile[]) => void;

  /* Tool calls — operate on last assistant message's `parts` */
  addToolCallToLastMessage: (tc: CodeLabToolCall) => void;
  updateToolCallInLastMessage: (id: string, update: Partial<CodeLabToolCall>) => void;

  /* Parallel tasks — operate on last assistant message's parallel-tasks parts */
  addParallelTaskGroup: (group: ParallelTaskGroup) => void;
  addToolCallToParallelTask: (groupId: string, taskId: string, tc: CodeLabToolCall) => void;
  updateParallelTaskToolCall: (
    groupId: string,
    taskId: string,
    toolCallId: string,
    update: Partial<CodeLabToolCall>,
  ) => void;
  updateParallelTask: (groupId: string, taskId: string, update: Partial<ParallelTaskInfo>) => void;

  /* Stream lifecycle */
  currentAgent: string;
  agentStatus: 'idle' | 'thinking' | 'tool_call' | 'writing';
  setAgent: (name: string, status: CodeLabState['agentStatus']) => void;
  costUsd: number;
  setCostUsd: (v: number) => void;

  /**
   * Finalize the last assistant message — flip every running tool / parallel
   * task to `completed` (or whatever final status applies). Used by
   * stop / done / error / unmount. Idempotent.
   */
  finalizeStreamingMessage: () => void;

  /** Reset everything to initial state. Used by plugin host on module reload. */
  reset: () => void;
}

/* ── Helpers ── */

function loadRecentDirs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('codelab_recent_dirs');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function persistRecentDirs(dirs: string[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem('codelab_recent_dirs', JSON.stringify(dirs.slice(0, 10))); } catch {}
}

/** Read-state cannot overwrite a write-state. The sidebar's "what got touched
 *  this session" view would otherwise lose its marks when the LLM re-reads a
 *  file it just modified. */
const WRITE_STATUSES: ReadonlySet<CodeLabFile['status']> =
  new Set<CodeLabFile['status']>(['modified', 'created', 'deleted']);

function mergeFileEntry(existing: CodeLabFile, incoming: CodeLabFile): CodeLabFile {
  if (incoming.status === 'read' && WRITE_STATUSES.has(existing.status)) {
    return existing; // keep the write-state mark
  }
  return incoming;
}

/** Map a running-or-pending tool/task to its closed counterpart. */
function closeToolCall(tc: CodeLabToolCall): CodeLabToolCall {
  if (tc.status === 'running' || tc.status === 'pending') {
    return { ...tc, status: 'completed' };
  }
  return tc;
}

function closeTask(t: ParallelTaskInfo): ParallelTaskInfo {
  if (t.status === 'running' || t.status === 'pending') {
    return {
      ...t,
      status: 'completed',
      endTime: t.endTime ?? Date.now(),
      toolCalls: t.toolCalls.map(closeToolCall),
    };
  }
  return { ...t, toolCalls: t.toolCalls.map(closeToolCall) };
}

/**
 * Operate on the last assistant message's parts. If the last message isn't
 * an assistant one (e.g. mid-flight before addMessage), the update is a no-op.
 * Keeps the mutation logic linear at the cost of a small lookup each call.
 */
function withLastAssistant(
  msgs: CodeLabMessage[],
  fn: (msg: CodeLabMessage) => CodeLabMessage,
): CodeLabMessage[] {
  const lastIdx = msgs.length - 1;
  if (lastIdx < 0) return msgs;
  const last = msgs[lastIdx];
  if (last.role !== 'assistant') return msgs;
  const updated = fn(last);
  if (updated === last) return msgs;
  const copy = msgs.slice();
  copy[lastIdx] = updated;
  return copy;
}

/* ── Initial state ── */

const INITIAL_STATE = {
  workingDirectory: null as string | null,
  recentDirectories: loadRecentDirs(),
  sessionId: null as string | null,
  sessionListVersion: 0,
  isStreaming: false,
  messages: [] as CodeLabMessage[],
  files: [] as CodeLabFile[],
  currentAgent: 'build',
  agentStatus: 'idle' as CodeLabState['agentStatus'],
  costUsd: 0,
};

/* ── Store ── */

export const useCodeLabStore = create<CodeLabState>((set, get) => ({
  ...INITIAL_STATE,

  /* Project */

  setWorkingDirectory: (dir) => {
    const recent = [dir, ...get().recentDirectories.filter((d) => d !== dir)].slice(0, 10);
    persistRecentDirs(recent);
    set({
      workingDirectory: dir,
      recentDirectories: recent,
      messages: [],
      files: [],
      sessionId: null,
      costUsd: 0,
    });
  },

  leaveDirectory: () => set({
    workingDirectory: null,
    messages: [],
    files: [],
    sessionId: null,
    costUsd: 0,
  }),

  removeRecentDirectory: (dir) => {
    const recent = get().recentDirectories.filter((d) => d !== dir);
    persistRecentDirs(recent);
    const reset = get().workingDirectory === dir
      ? { workingDirectory: null, messages: [], files: [], sessionId: null, costUsd: 0 }
      : {};
    set({ recentDirectories: recent, ...reset });
  },

  /* Session */

  setSessionId: (id) => set({ sessionId: id }),
  bumpSessionList: () => set((s) => ({ sessionListVersion: s.sessionListVersion + 1 })),
  setStreaming: (v) => set({ isStreaming: v }),

  /* Messages */

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  setMessages: (msgs) => set({ messages: msgs }),

  appendToLastMessage: (text) =>
    set((s) => ({
      messages: withLastAssistant(s.messages, (last) => {
        const parts = last.parts.slice();
        const tail = parts[parts.length - 1];
        if (tail?.kind === 'text') {
          parts[parts.length - 1] = { kind: 'text', content: tail.content + text };
        } else {
          parts.push({ kind: 'text', content: text });
        }
        return { ...last, content: last.content + text, parts };
      }),
    })),

  /* Files */

  addFile: (f) =>
    set((s) => {
      const idx = s.files.findIndex((e) => e.path === f.path);
      if (idx < 0) return { files: [...s.files, f] };
      const merged = mergeFileEntry(s.files[idx], f);
      if (merged === s.files[idx]) return s;
      const next = s.files.slice();
      next[idx] = merged;
      return { files: next };
    }),

  setFiles: (f) => set({ files: f }),

  /* Tool calls in the main thread */

  addToolCallToLastMessage: (tc) =>
    set((s) => ({
      messages: withLastAssistant(s.messages, (last) => ({
        ...last,
        parts: [...last.parts, { kind: 'tool', toolCall: tc }],
      })),
    })),

  updateToolCallInLastMessage: (id, update) =>
    set((s) => ({
      messages: withLastAssistant(s.messages, (last) => ({
        ...last,
        parts: last.parts.map((p) =>
          p.kind === 'tool' && p.toolCall.id === id
            ? { kind: 'tool', toolCall: { ...p.toolCall, ...update } }
            : p,
        ),
      })),
    })),

  /* Parallel tasks */

  addParallelTaskGroup: (group) =>
    set((s) => ({
      messages: withLastAssistant(s.messages, (last) => ({
        ...last,
        parts: [...last.parts, { kind: 'parallel-tasks', group }],
      })),
    })),

  addToolCallToParallelTask: (groupId, taskId, tc) =>
    set((s) => ({
      messages: withLastAssistant(s.messages, (last) => ({
        ...last,
        parts: last.parts.map((p) => {
          if (p.kind !== 'parallel-tasks' || p.group.id !== groupId) return p;
          return {
            kind: 'parallel-tasks',
            group: {
              ...p.group,
              tasks: p.group.tasks.map((t) =>
                t.id === taskId ? { ...t, toolCalls: [...t.toolCalls, tc] } : t,
              ),
            },
          };
        }),
      })),
    })),

  updateParallelTaskToolCall: (groupId, taskId, toolCallId, update) =>
    set((s) => ({
      messages: withLastAssistant(s.messages, (last) => ({
        ...last,
        parts: last.parts.map((p) => {
          if (p.kind !== 'parallel-tasks' || p.group.id !== groupId) return p;
          return {
            kind: 'parallel-tasks',
            group: {
              ...p.group,
              tasks: p.group.tasks.map((t) => {
                if (t.id !== taskId) return t;
                return {
                  ...t,
                  toolCalls: t.toolCalls.map((tc) =>
                    tc.id === toolCallId ? { ...tc, ...update } : tc,
                  ),
                };
              }),
            },
          };
        }),
      })),
    })),

  updateParallelTask: (groupId, taskId, update) =>
    set((s) => ({
      messages: withLastAssistant(s.messages, (last) => ({
        ...last,
        parts: last.parts.map((p) => {
          if (p.kind !== 'parallel-tasks' || p.group.id !== groupId) return p;
          const tasks = p.group.tasks.map((t) => (t.id === taskId ? { ...t, ...update } : t));
          const groupStatus: ParallelTaskGroup['status'] =
            tasks.every((t) => t.status !== 'running' && t.status !== 'pending')
              ? (tasks.some((t) => t.status === 'error' || t.status === 'timeout') ? 'partial' : 'completed')
              : 'running';
          return { kind: 'parallel-tasks', group: { ...p.group, tasks, status: groupStatus } };
        }),
      })),
    })),

  /* Stream lifecycle */

  setAgent: (name, status) => set({ currentAgent: name, agentStatus: status }),
  setCostUsd: (v) => set({ costUsd: v }),

  finalizeStreamingMessage: () =>
    set((s) => ({
      messages: withLastAssistant(s.messages, (last) => ({
        ...last,
        parts: last.parts.map((p) => {
          if (p.kind === 'tool') return { kind: 'tool', toolCall: closeToolCall(p.toolCall) };
          if (p.kind === 'parallel-tasks') {
            const tasks = p.group.tasks.map(closeTask);
            const groupStatus: ParallelTaskGroup['status'] =
              tasks.some((t) => t.status === 'error' || t.status === 'timeout') ? 'partial' : 'completed';
            return { kind: 'parallel-tasks', group: { ...p.group, tasks, status: groupStatus } };
          }
          return p;
        }),
      })),
    })),

  /* Reset */

  reset: () => set(INITIAL_STATE),
}));
