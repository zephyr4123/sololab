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
  status: 'running' | 'completed' | 'error';
  title?: string;
  timestamp: number;
}

export interface CodeLabPermission {
  id: string;
  tool: string;
  description: string;
  status: 'pending' | 'approved' | 'denied';
}

export interface CodeLabMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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

  setSessionId: (id) => set({ sessionId: id }),
  setSessions: (s) => set({ sessions: s }),
  setStreaming: (v) => set({ isStreaming: v }),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendToLastMessage: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
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

  setPendingPermission: (p) => set({ pendingPermission: p }),
  setAgent: (name, status) => set({ currentAgent: name, agentStatus: status }),
  setCostUsd: (v) => set({ costUsd: v }),

  reset: () => set(initialState),
}));
