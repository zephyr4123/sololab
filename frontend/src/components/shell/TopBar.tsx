'use client';

import { useState, useEffect } from 'react';
import { Settings, Sun, Moon, Cpu } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { SettingsPanel } from '@/components/shell/SettingsPanel';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
      <header className="flex h-11 items-center justify-between border-b border-border/40 bg-background/60 backdrop-blur-md px-5">
        <div className="flex items-center gap-2.5">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground/40" />
          {providers.length > 0 ? (
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="appearance-none rounded-md border-0 bg-foreground/[0.04] px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] focus:outline-none focus:ring-1 focus:ring-[var(--color-warm)]/40"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-muted-foreground/40 tracking-wide">Loading models...</span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 text-muted-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground transition-all duration-200"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg p-2 text-muted-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground transition-all duration-200"
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
