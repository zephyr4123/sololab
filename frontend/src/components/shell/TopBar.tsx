'use client';

import { Settings, Sun, Moon, Activity } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';

export function TopBar() {
  const { provider, providers, setProvider, theme, toggleTheme } = useAppStore();

  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
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
