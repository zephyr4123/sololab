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
  theme: (typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark') ? 'dark' : 'light',
  setCurrentModule: (moduleId) => set({ currentModule: moduleId }),
  setProvider: (provider) => set({ provider }),
  setProviders: (providers) => set({ providers }),
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'light' ? 'dark' : 'light';
      // 切换 <html> 的 dark class
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', next === 'dark');
        localStorage.setItem('theme', next);
      }
      return { theme: next };
    }),
}));
