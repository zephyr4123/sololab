'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Lightbulb, Code, PenTool, BarChart3, BookOpen, Search, Lock, Sun, Moon,
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { getAllModules } from '@/lib/module-loader';

const ICON_MAP: Record<string, typeof Lightbulb> = {
  Lightbulb, Code, PenTool, BarChart3, BookOpen, Search,
};

export function Sidebar() {
  const currentModule = useAppStore((s) => s.currentModule);
  const setCurrentModule = useAppStore((s) => s.setCurrentModule);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const modules = getAllModules();

  return (
    <aside className="flex h-full w-16 flex-col border-r border-border/50 bg-card/40 backdrop-blur-md lg:w-60">
      {/* Logo */}
      <Link href="/" className="group flex items-center gap-3 px-4 py-5 transition-opacity hover:opacity-80">
        <Image src="/logo.png" alt="SoloLab" width={30} height={30} className="h-[30px] w-auto object-contain" />
        <div className="hidden lg:block">
          <span className="text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            SoloLab
          </span>
        </div>
      </Link>

      {/* Divider */}
      <div className="mx-4 mb-3 h-px bg-gradient-to-r from-border via-border/60 to-transparent" />

      {/* Navigation label */}
      <p className="hidden mb-2 px-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50 lg:block">
        Modules
      </p>

      <nav className="flex flex-1 flex-col gap-0.5 px-2.5">
        {modules.map((mod) => {
          const Icon = ICON_MAP[mod.icon] ?? Code;
          const isActive = currentModule === mod.id;
          const isReady = mod.status === 'ready';

          if (!isReady) {
            return (
              <div
                key={mod.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground/30 cursor-not-allowed"
                title={mod.description ?? 'Coming soon'}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/40 shrink-0">
                  <Icon className="h-[15px] w-[15px]" />
                </div>
                <span className="hidden flex-1 lg:block">{mod.name}</span>
                <Lock className="hidden h-3 w-3 opacity-40 lg:block" />
              </div>
            );
          }

          return (
            <Link
              key={mod.id}
              href={`/modules/${mod.id}`}
              onClick={() => setCurrentModule(mod.id)}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-foreground/[0.07] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                  : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
              }`}
            >
              <div className={`module-icon-wrap flex h-7 w-7 items-center justify-center rounded-lg shrink-0 transition-all duration-200 ${
                isActive
                  ? 'bg-[var(--color-warm)]/12 text-[var(--color-warm)]'
                  : 'bg-foreground/[0.04] group-hover:bg-[var(--color-warm)]/8 group-hover:text-[var(--color-warm)]'
              }`}>
                <Icon className="h-[15px] w-[15px]" />
              </div>
              <span className="hidden lg:block">{mod.name}</span>
              {isActive && (
                <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-[var(--color-warm)] lg:block" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
        <p className="hidden text-[10px] text-muted-foreground/40 tracking-wider lg:block">
          SuXiang.Huang
        </p>
        <button
          onClick={toggleTheme}
          className="rounded-md p-1.5 text-muted-foreground/40 hover:bg-foreground/[0.05] hover:text-foreground transition-all"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>
    </aside>
  );
}
