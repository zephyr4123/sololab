import { create } from 'zustand';
import { sessionApi } from '@/lib/api-client';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useTaskStore } from '@/stores/task-store';

interface StreamEvent {
  type: string;
  [key: string]: any;
}

export interface ChatEntry {
  kind: 'user' | 'stream';
  userText?: string;
  events?: StreamEvent[];
}

export interface SessionInfo {
  session_id: string;
  title: string;
  module_id: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

interface SessionState {
  // Current conversation
  currentSessionId: string | null;
  chatEntries: ChatEntry[];
  isLoadingHistory: boolean;

  // Sessions list
  sessions: SessionInfo[];
  isLoadingSessions: boolean;

  // Chat entry management
  appendChatEntry: (entry: ChatEntry) => void;
  appendEventToLastEntry: (event: StreamEvent) => void;
  setChatEntries: (entries: ChatEntry[]) => void;

  // Session management
  setCurrentSession: (id: string | null) => void;
  fetchSessions: (moduleId: string) => Promise<void>;
  createSession: (title: string, moduleId: string) => Promise<string>;
  loadHistory: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  resetConversation: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  currentSessionId: null,
  chatEntries: [],
  isLoadingHistory: false,
  sessions: [],
  isLoadingSessions: false,

  appendChatEntry: (entry) =>
    set((s) => ({ chatEntries: [...s.chatEntries, entry] })),

  appendEventToLastEntry: (event) =>
    set((s) => {
      const copy = [...s.chatEntries];
      const last = copy[copy.length - 1];
      if (last && last.kind === 'stream') {
        copy[copy.length - 1] = {
          ...last,
          events: [...(last.events || []), event],
        };
      }
      return { chatEntries: copy };
    }),

  setChatEntries: (entries) => set({ chatEntries: entries }),

  setCurrentSession: (id) => set({ currentSessionId: id }),

  fetchSessions: async (moduleId) => {
    set({ isLoadingSessions: true });
    try {
      const data = await sessionApi.list(50, moduleId);
      // API returns array directly, not {sessions: [...]}
      const rawList = Array.isArray(data) ? data : (data.sessions || []);
      const sessions: SessionInfo[] = rawList.map((s: any) => ({
        session_id: s.session_id,
        title: s.title || 'Untitled',
        module_id: s.module_id,
        status: s.status,
        created_at: s.created_at,
        updated_at: s.updated_at,
      }));
      set({ sessions });
    } catch {
      // Backend unavailable, keep empty
    } finally {
      set({ isLoadingSessions: false });
    }
  },

  createSession: async (title, moduleId) => {
    // Session is now created by backend in stream_module
    // This is a fallback if needed
    const result = await sessionApi.create(title, moduleId);
    const newSession: SessionInfo = {
      session_id: result.session_id,
      title,
      module_id: moduleId,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    set((s) => ({
      sessions: [newSession, ...s.sessions],
      currentSessionId: result.session_id,
    }));
    return result.session_id;
  },

  loadHistory: async (sessionId) => {
    set({ isLoadingHistory: true });
    try {
      const data = await sessionApi.getHistory(sessionId);
      const messages: any[] = data.messages || [];

      const chatEntries: ChatEntry[] = [];
      let lastAssistantEvents: StreamEvent[] = [];

      for (const msg of messages) {
        if (msg.role === 'user') {
          chatEntries.push({ kind: 'user', userText: msg.content });
        } else if (msg.role === 'assistant') {
          const events = msg.metadata?.events || [];
          chatEntries.push({ kind: 'stream', events });
          if (events.length > 0) {
            lastAssistantEvents = events;
          }
        }
      }

      set({ chatEntries, currentSessionId: sessionId });

      // Restore IdeaSpark store from events
      if (lastAssistantEvents.length > 0) {
        useIdeaSparkStore.getState().restoreFromHistory(lastAssistantEvents);
      }
    } catch {
      // Failed to load history
    } finally {
      set({ isLoadingHistory: false });
    }
  },

  deleteSession: async (sessionId) => {
    try {
      await sessionApi.delete(sessionId);
    } catch {
      // Ignore delete failure
    }
    const { currentSessionId } = get();
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.session_id !== sessionId),
    }));
    if (currentSessionId === sessionId) {
      get().resetConversation();
    }
  },

  resetConversation: () => {
    set({ currentSessionId: null, chatEntries: [] });
    useIdeaSparkStore.getState().reset();
    useTaskStore.getState().reset();
  },
}));
