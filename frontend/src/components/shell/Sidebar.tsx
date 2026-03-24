'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Lightbulb, Code, PenTool, BarChart3, BookOpen, Search, Lock } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';

const modules = [
  { id: 'ideaspark', name: 'IdeaSpark', icon: Lightbulb, ready: true },
  { id: 'codelab', name: 'CodeLab', icon: Code, ready: false },
  { id: 'writer', name: 'WriterAI', icon: PenTool, ready: false },
  { id: 'datalens', name: 'DataLens', icon: BarChart3, ready: false },
  { id: 'litreview', name: 'LitReview', icon: BookOpen, ready: false },
  { id: 'reviewer', name: 'Reviewer', icon: Search, ready: false },
];

export function Sidebar() {
  const currentModule = useAppStore((s) => s.currentModule);
  const setCurrentModule = useAppStore((s) => s.setCurrentModule);

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

      {/* Divider with warm accent */}
      <div className="mx-4 mb-3 h-px bg-gradient-to-r from-border via-border/60 to-transparent" />

      {/* Navigation label */}
      <p className="hidden mb-2 px-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50 lg:block">
        Modules
      </p>

      <nav className="flex flex-1 flex-col gap-0.5 px-2.5">
        {modules.map((mod) => {
          const Icon = mod.icon;
          const isActive = currentModule === mod.id;

          if (!mod.ready) {
            return (
              <div
                key={mod.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground/30 cursor-not-allowed"
                title="Coming soon"
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
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
              <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? 'text-[var(--color-warm)]' : ''}`} />
              <span className="hidden lg:block">{mod.name}</span>
              {isActive && (
                <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-[var(--color-warm)] lg:block" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-border/30">
        <p className="hidden text-[10px] text-muted-foreground/40 text-center tracking-wider lg:block">
          S.Huang
        </p>
      </div>
    </aside>
  );
}
