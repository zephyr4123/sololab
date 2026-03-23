import { create } from 'zustand';

interface ProviderInfo {
  id: string;
  label: string;
}

const DEFAULT_PROVIDERS: ProviderInfo[] = [
  { id: 'openai/gpt-4o', label: 'GPT-4o' },
  { id: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek' },
  { id: 'google/gemini-2.0-flash', label: 'Gemini Flash' },
  { id: 'ollama/qwen2.5:14b', label: 'Qwen 2.5 (Local)' },
];

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
  provider: 'openai/gpt-4o',
  providers: DEFAULT_PROVIDERS,
  theme: 'light',
  setCurrentModule: (moduleId) => set({ currentModule: moduleId }),
  setProvider: (provider) => set({ provider }),
  setProviders: (providers) => set({ providers }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
}));
