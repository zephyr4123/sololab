import { create } from 'zustand';

interface SessionState {
  currentSessionId: string | null;
  sessions: { id: string; createdAt: string }[];
  setCurrentSession: (id: string | null) => void;
  addSession: (session: { id: string; createdAt: string }) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  currentSessionId: null,
  sessions: [],
  setCurrentSession: (id) => set({ currentSessionId: id }),
  addSession: (session) => set((s) => ({ sessions: [...s.sessions, session] })),
}));
