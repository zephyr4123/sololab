import { create } from 'zustand';

/* ── Types ── */

export interface CodeLabFile {
  path: string;
  language: string;
  status: 'read' | 'modified' | 'created' | 'deleted';
}

export interface CodeLabToolCall {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  title?: string;
  timestamp: number;
}

export interface CodeLabPermission {
  id: string;
  tool: string;
  description: string;
  status: 'pending' | 'approved' | 'denied';
}

/* ── Parallel Task Types ── */

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
  toolCalls?: CodeLabToolCall[];
  timestamp: number;
}

/* ── Store ── */

interface CodeLabState {
  // Session
  sessionId: string | null;
  sessions: Array<{ id: string; title: string; createdAt: string }>;
  isStreaming: boolean;

  // Messages
  messages: CodeLabMessage[];

  // File tracking
  files: CodeLabFile[];

  // Active tool calls
  activeToolCalls: CodeLabToolCall[];

  // Permissions
  pendingPermission: CodeLabPermission | null;

  // Agent info
  currentAgent: string;
  agentStatus: 'idle' | 'thinking' | 'tool_call' | 'writing';

  // Cost
  costUsd: number;

  // Directory
  workingDirectory: string | null;
  recentDirectories: string[];
  setWorkingDirectory: (dir: string) => void;
  leaveDirectory: () => void;
  removeRecentDirectory: (dir: string) => void;

  // Actions
  setSessionId: (id: string | null) => void;
  setSessions: (s: Array<{ id: string; title: string; createdAt: string }>) => void;
  setStreaming: (v: boolean) => void;
  addMessage: (msg: CodeLabMessage) => void;
  appendToLastMessage: (text: string) => void;
  setMessages: (msgs: CodeLabMessage[]) => void;
  addFile: (f: CodeLabFile) => void;
  setFiles: (f: CodeLabFile[]) => void;
  addToolCall: (tc: CodeLabToolCall) => void;
  updateToolCall: (id: string, update: Partial<CodeLabToolCall>) => void;
  clearToolCalls: () => void;
  addToolCallToLastMessage: (tc: CodeLabToolCall) => void;
  updateToolCallInLastMessage: (id: string, update: Partial<CodeLabToolCall>) => void;
  finalizeLastMessageToolCalls: () => void;

  // Parallel task management
  addParallelTaskGroup: (group: ParallelTaskGroup) => void;
  addToolCallToParallelTask: (groupId: string, taskId: string, tc: CodeLabToolCall) => void;
  updateParallelTask: (groupId: string, taskId: string, update: Partial<ParallelTaskInfo>) => void;
  finalizeParallelTaskGroup: (groupId: string) => void;
  setPendingPermission: (p: CodeLabPermission | null) => void;
  setAgent: (name: string, status: CodeLabState['agentStatus']) => void;
  setCostUsd: (v: number) => void;
  reset: () => void;
}

const initialState = {
  /** Project directory — must be set before starting conversations */
  workingDirectory: null as string | null,
  /** Recent directories for quick access */
  recentDirectories: [] as string[],
  sessionId: null as string | null,
  sessions: [] as Array<{ id: string; title: string; createdAt: string }>,
  isStreaming: false,
  messages: [] as CodeLabMessage[],
  files: [] as CodeLabFile[],
  activeToolCalls: [] as CodeLabToolCall[],
  pendingPermission: null as CodeLabPermission | null,
  currentAgent: 'build',
  agentStatus: 'idle' as CodeLabState['agentStatus'],
  costUsd: 0,
};

export const useCodeLabStore = create<CodeLabState>((set, get) => ({
  ...initialState,

  setWorkingDirectory: (dir) => {
    const recent = get().recentDirectories.filter((d) => d !== dir);
    recent.unshift(dir);
    // Persist to localStorage
    try { localStorage.setItem('codelab_recent_dirs', JSON.stringify(recent.slice(0, 10))); } catch {}
    set({ workingDirectory: dir, recentDirectories: recent.slice(0, 10), messages: [], files: [], sessionId: null, costUsd: 0 });
  },

  leaveDirectory: () => set({ workingDirectory: null, messages: [], files: [], sessionId: null, activeToolCalls: [], costUsd: 0 }),

  removeRecentDirectory: (dir) => {
    const recent = get().recentDirectories.filter((d) => d !== dir);
    try { localStorage.setItem('codelab_recent_dirs', JSON.stringify(recent)); } catch {}
    const update: Partial<CodeLabState> = { recentDirectories: recent };
    if (get().workingDirectory === dir) {
      Object.assign(update, { workingDirectory: null, messages: [], files: [], sessionId: null, activeToolCalls: [], costUsd: 0 });
    }
    set(update as any);
  },

  setSessionId: (id) => set({ sessionId: id }),
  setSessions: (s) => set({ sessions: s }),
  setStreaming: (v) => set({ isStreaming: v }),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendToLastMessage: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        const parts = [...(last.parts || [])];
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart.kind === 'text') {
          parts[parts.length - 1] = { kind: 'text', content: lastPart.content + text };
        } else {
          parts.push({ kind: 'text', content: text });
        }
        msgs[msgs.length - 1] = { ...last, content: last.content + text, parts };
      }
      return { messages: msgs };
    }),

  setMessages: (msgs) => set({ messages: msgs }),

  addFile: (f) =>
    set((s) => {
      const existing = s.files.findIndex((e) => e.path === f.path);
      if (existing >= 0) {
        const copy = [...s.files];
        copy[existing] = f;
        return { files: copy };
      }
      return { files: [...s.files, f] };
    }),

  setFiles: (f) => set({ files: f }),

  addToolCall: (tc) => set((s) => ({ activeToolCalls: [...s.activeToolCalls, tc] })),

  updateToolCall: (id, update) =>
    set((s) => ({
      activeToolCalls: s.activeToolCalls.map((tc) => (tc.id === id ? { ...tc, ...update } : tc)),
    })),

  clearToolCalls: () => set({ activeToolCalls: [] }),

  addToolCallToLastMessage: (tc) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        const parts = [...(last.parts || [])];
        parts.push({ kind: 'tool', toolCall: tc });
        msgs[msgs.length - 1] = { ...last, parts, toolCalls: [...(last.toolCalls || []), tc] };
      }
      return { messages: msgs };
    }),

  updateToolCallInLastMessage: (id, update) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        const parts = (last.parts || []).map((p) =>
          p.kind === 'tool' && p.toolCall.id === id
            ? { ...p, toolCall: { ...p.toolCall, ...update } }
            : p
        );
        const toolCalls = (last.toolCalls || []).map((tc) =>
          tc.id === id ? { ...tc, ...update } : tc
        );
        msgs[msgs.length - 1] = { ...last, parts, toolCalls };
      }
      return { messages: msgs };
    }),

  finalizeLastMessageToolCalls: () =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        const finalize = (tc: CodeLabToolCall) =>
          tc.status === 'running' ? { ...tc, status: 'completed' as const } : tc;
        const parts = (last.parts || []).map((p) =>
          p.kind === 'tool' ? { ...p, toolCall: finalize(p.toolCall) } : p
        );
        const toolCalls = (last.toolCalls || []).map(finalize);
        msgs[msgs.length - 1] = { ...last, parts, toolCalls };
      }
      return { messages: msgs };
    }),

  addParallelTaskGroup: (group) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        const parts = [...(last.parts || [])];
        parts.push({ kind: 'parallel-tasks', group });
        msgs[msgs.length - 1] = { ...last, parts };
      }
      return { messages: msgs };
    }),

  addToolCallToParallelTask: (groupId, taskId, tc) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        const parts = (last.parts || []).map((p) => {
          if (p.kind !== 'parallel-tasks' || p.group.id !== groupId) return p;
          const tasks = p.group.tasks.map((t) =>
            t.id === taskId ? { ...t, toolCalls: [...t.toolCalls, tc] } : t
          );
          return { ...p, group: { ...p.group, tasks } };
        });
        msgs[msgs.length - 1] = { ...last, parts };
      }
      return { messages: msgs };
    }),

  updateParallelTask: (groupId, taskId, update) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        const parts = (last.parts || []).map((p) => {
          if (p.kind !== 'parallel-tasks' || p.group.id !== groupId) return p;
          const tasks = p.group.tasks.map((t) =>
            t.id === taskId ? { ...t, ...update } : t
          );
          return { ...p, group: { ...p.group, tasks } };
        });
        msgs[msgs.length - 1] = { ...last, parts };
      }
      return { messages: msgs };
    }),

  finalizeParallelTaskGroup: (groupId) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        const parts = (last.parts || []).map((p) => {
          if (p.kind !== 'parallel-tasks' || p.group.id !== groupId) return p;
          const tasks = p.group.tasks.map((t) =>
            t.status === 'running' ? { ...t, status: 'completed' as const, endTime: Date.now() } : t
          );
          const allDone = tasks.every((t) => t.status !== 'running');
          return { ...p, group: { ...p.group, tasks, status: allDone ? 'completed' as const : 'partial' as const } };
        });
        msgs[msgs.length - 1] = { ...last, parts };
      }
      return { messages: msgs };
    }),

  setPendingPermission: (p) => set({ pendingPermission: p }),
  setAgent: (name, status) => set({ currentAgent: name, agentStatus: status }),
  setCostUsd: (v) => set({ costUsd: v }),

  reset: () => set(initialState),
}));
