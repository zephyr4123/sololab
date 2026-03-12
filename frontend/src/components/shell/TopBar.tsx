'use client';

import { Settings, Sun, Moon } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';

export function TopBar() {
  const { provider, setProvider, theme, toggleTheme } = useAppStore();

  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-4">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="openai/gpt-4o">GPT-4o</option>
          <option value="anthropic/claude-sonnet-4-20250514">Claude Sonnet</option>
          <option value="deepseek/deepseek-chat">DeepSeek</option>
          <option value="ollama/qwen2.5:14b">Qwen 2.5 (Local)</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="rounded-md p-2 hover:bg-accent"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button className="rounded-md p-2 hover:bg-accent" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
