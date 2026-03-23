'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { theme, toggleTheme, provider, providers, setProvider } = useAppStore();
  const [health, setHealth] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`${BASE_URL}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* 面板 */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l bg-background shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">设置</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* 外观 */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">外观</h3>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm">深色模式</span>
              <button
                onClick={toggleTheme}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  theme === 'dark' ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    theme === 'dark' ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </section>

          {/* 模型 */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">模型</h3>
            <div className="space-y-2">
              <div className="rounded-lg border p-3">
                <label className="mb-1 block text-xs text-muted-foreground">当前模型</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* 系统状态 */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">系统状态</h3>
            {health ? (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">版本</span>
                  <span className="font-mono">{health.version}</span>
                </div>
                {health.services && Object.entries(health.services).map(([name, ok]) => (
                  <div key={name} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{name}</span>
                    <span className={ok ? 'text-green-600' : 'text-red-500'}>
                      {ok ? '在线' : '离线'}
                    </span>
                  </div>
                ))}
                {health.modules_loaded != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">已加载模块</span>
                    <span>{health.modules_loaded}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">无法连接后端</p>
            )}
          </section>

          {/* 关于 */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">关于</h3>
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">SoloLab</p>
              <p className="mt-1">面向独立研究者的 AI 辅助研究平台</p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
