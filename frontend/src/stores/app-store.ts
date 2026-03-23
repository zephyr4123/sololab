import { create } from 'zustand';

interface ProviderInfo {
  id: string;
  label: string;
}

interface AppState {
  currentModule: string | null;
  provider: string;
  providers: ProviderInfo[];
  theme: 'light' | 'dark';
  setCurrentModule: (moduleId: string | null) => void;
  setProvider: (provider: string) => void;
  setProviders: (providers: ProviderInfo[]) => void;
  toggleTheme: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentModule: null,
  provider: '',
  providers: [],
  theme: 'light',
  setCurrentModule: (moduleId) => set({ currentModule: moduleId }),
  setProvider: (provider) => set({ provider }),
  setProviders: (providers) => set({ providers }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
}));
