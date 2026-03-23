'use client';

import { useState, useEffect } from 'react';
import { Settings, Sun, Moon, Activity } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { SettingsPanel } from '@/components/shell/SettingsPanel';

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export function TopBar() {
  const { provider, providers, setProvider, setProviders, theme, toggleTheme } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/providers`);
        if (!res.ok) return;
        const data = await res.json();
        const models = data.models || [];
        if (models.length > 0) {
          setProviders(models);
          if (!provider) {
            setProvider(data.default_model || models[0].id);
          }
        }
      } catch {
        // 后端不可用时保持空列表
      }
    };
    fetchProviders();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <header className="flex h-12 items-center justify-between border-b border-border/60 bg-background/80 backdrop-blur-sm px-4">
        <div className="flex items-center gap-3">
          <Activity className="h-4 w-4 text-muted-foreground/60" />
          {providers.length > 0 ? (
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs font-medium"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-muted-foreground">Loading models...</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
