'use client';

/**
 * Sidebar — the lab's primary navigation.
 *
 * Visual contract:
 *   - Fixed 224px width. No collapse — a desktop research tool
 *     has room to breathe and shows status without a toggle.
 *   - Top: a monogram badge + "SoloLab" wordmark + lab eyebrow.
 *   - Middle: a single rounded "studio-card" that holds two groups
 *     (READY modules + planned ones), separated by a soft fading
 *     divider rather than a hard hairline.
 *   - Bottom (inside the same card): TodayWidget — quiet pulse of
 *     today's LLM activity in JetBrains Mono.
 *   - The whole thing reads as a single floating panel pinned to
 *     the page, not as a column with seams.
 */

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  Code,
  Lightbulb,
  Lock,
  Moon,
  PenTool,
  Search,
  Sun,
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { getAllModules } from '@/lib/module-loader';
import { TodayWidget } from './TodayWidget';

const ICON_MAP: Record<string, typeof Lightbulb> = {
  Lightbulb,
  Code,
  PenTool,
  BarChart3,
  BookOpen,
  Search,
};

export function Sidebar() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const setCurrentModule = useAppStore((s) => s.setCurrentModule);
  const pathname = usePathname();
  const modules = getAllModules();

  const ready = modules.filter((m) => m.status === 'ready');
  const planned = modules.filter((m) => m.status === 'planned');

  const isHome = pathname === '/';

  return (
    <aside className="flex h-full w-[224px] shrink-0 flex-col px-3 pt-3 pb-3">
      {/* Logo — monogram + wordmark, sits above the studio card */}
      <Link
        href="/"
        className="group mb-3 flex items-center gap-2.5 px-2 py-1.5 transition-opacity hover:opacity-90"
        onClick={() => setCurrentModule(null)}
      >
        <div className="relative">
          <div className="monogram" aria-hidden />
          {isHome && (
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-warm shadow-[0_0_0_2px_var(--color-background)]"
            />
          )}
        </div>
        <div className="flex flex-col leading-none">
          <span
            className="text-[15px] font-semibold tracking-tight text-foreground/95"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            SoloLab
          </span>
          <span className="mt-0.5 atelier-eyebrow" style={{ letterSpacing: '0.32em' }}>
            Research Lab
          </span>
        </div>
      </Link>

      {/* Studio card — single floating panel that holds everything else */}
      <div className="studio-card flex flex-1 flex-col overflow-hidden p-3">
        {/* READY modules group */}
        <SectionLabel>Modules</SectionLabel>
        <nav className="mt-2 flex flex-col gap-0.5">
          {ready.map((mod) => {
            const Icon = ICON_MAP[mod.icon] ?? Code;
            const isActive = pathname === `/modules/${mod.id}`;
            return (
              <Link
                key={mod.id}
                href={`/modules/${mod.id}`}
                onClick={() => setCurrentModule(mod.id)}
                className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                    isActive
                      ? 'bg-warm/15 text-warm'
                      : 'bg-foreground/[0.04] text-foreground/65 group-hover:bg-warm/10 group-hover:text-warm'
                  }`}
                >
                  <Icon className="h-[14px] w-[14px]" strokeWidth={2} />
                </span>
                <span className="flex-1 text-[13px] font-medium tracking-tight">
                  {mod.name}
                </span>
                {isActive && (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-warm"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* SOFT SEAM */}
        <hr className="soft-divider mx-2 my-3.5" />

        {/* SOON group */}
        <SectionLabel tone="muted">Coming soon</SectionLabel>
        <div className="mt-2 flex flex-col gap-0.5 opacity-55">
          {planned.map((mod) => {
            const Icon = ICON_MAP[mod.icon] ?? Code;
            return (
              <div
                key={mod.id}
                className="flex cursor-not-allowed items-center gap-2.5 rounded-[0.6rem] px-3 py-1.5"
                title={`${mod.name} — ${mod.description}`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.025] text-foreground/40">
                  <Icon className="h-[13px] w-[13px]" strokeWidth={1.8} />
                </span>
                <span className="flex-1 text-[12.5px] tracking-tight text-foreground/45">
                  {mod.name}
                </span>
                <Lock className="h-2.5 w-2.5 shrink-0 text-foreground/25" />
              </div>
            );
          })}
        </div>

        {/* SPACER pushes Today + footer to the bottom of the card */}
        <div className="flex-1 min-h-3" />

        {/* TODAY widget */}
        <TodayWidget />

        {/* Footer row inside studio card */}
        <div className="mt-2.5 flex items-center justify-between px-1">
          <span
            className="text-[9.5px] uppercase tracking-[0.22em] text-muted-foreground/45"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Zephyr · 2026
          </span>
          <button
            onClick={toggleTheme}
            className="rounded-md p-1 text-muted-foreground/45 transition-colors hover:bg-foreground/[0.05] hover:text-foreground/85"
            aria-label="切换主题"
            title={theme === 'dark' ? '切换为亮色' : '切换为暗色'}
          >
            {theme === 'dark' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({
  children,
  tone = 'warm',
}: {
  children: React.ReactNode;
  tone?: 'warm' | 'muted';
}) {
  return (
    <div className="flex items-center gap-2 px-2">
      <span
        className="atelier-eyebrow"
        style={tone === 'muted' ? { color: 'color-mix(in oklab, var(--color-muted-foreground) 70%, transparent)' } : undefined}
      >
        {children}
      </span>
      <span
        aria-hidden
        className="h-px flex-1"
        style={{
          background:
            tone === 'warm'
              ? 'linear-gradient(to right, color-mix(in oklab, var(--color-warm) 30%, transparent), transparent 80%)'
              : 'linear-gradient(to right, color-mix(in oklab, var(--color-border) 60%, transparent), transparent 80%)',
        }}
      />
    </div>
  );
}
