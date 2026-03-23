'use client';

import { useEffect } from 'react';
import { Settings, Sun, Moon, Activity } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export function TopBar() {
  const { provider, providers, setProvider, setProviders, theme, toggleTheme } = useAppStore();

  // 启动时从后端 API 获取实际配置的模型列表
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/providers`);
        if (!res.ok) return;
        const data = await res.json();
        const models = data.models || [];
        if (models.length > 0) {
          setProviders(models);
          // 如果当前没有选中模型，设为后端默认模型
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
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          {providers.length > 0 ? (
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
          ) : (
            <span className="text-sm text-muted-foreground">Loading models...</span>
          )}
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
