import { create } from 'zustand';

interface AppState {
  currentModule: string | null;
  provider: string;
  theme: 'light' | 'dark';
  setCurrentModule: (moduleId: string | null) => void;
  setProvider: (provider: string) => void;
  toggleTheme: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentModule: null,
  provider: 'openai/gpt-4o',
  theme: 'light',
  setCurrentModule: (moduleId) => set({ currentModule: moduleId }),
  setProvider: (provider) => set({ provider }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
}));
