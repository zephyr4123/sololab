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
    <aside className="flex h-full w-16 flex-col border-r bg-card/50 backdrop-blur-sm lg:w-56">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 px-4 py-5 transition-opacity hover:opacity-80">
        <Image src="/logo.png" alt="SoloLab" width={28} height={28} className="h-7 w-7 object-contain" />
        <span className="hidden text-base font-bold tracking-tight lg:block">SoloLab</span>
      </Link>

      {/* Divider */}
      <div className="mx-3 mb-2 h-px bg-border/60" />

      {/* Navigation label */}
      <p className="hidden mb-1.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 lg:block">
        Modules
      </p>

      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {modules.map((mod) => {
          const Icon = mod.icon;
          const isActive = currentModule === mod.id;

          if (!mod.ready) {
            return (
              <div
                key={mod.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/40 cursor-not-allowed"
                title="Coming soon"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden flex-1 lg:block">{mod.name}</span>
                <Lock className="hidden h-3 w-3 lg:block" />
              </div>
            );
          }

          return (
            <Link
              key={mod.id}
              href={`/modules/${mod.id}`}
              onClick={() => setCurrentModule(mod.id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:block">{mod.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border/40">
        <p className="hidden text-[10px] text-muted-foreground/50 text-center lg:block">
          Powered By Suxiang.Huang
        </p>
      </div>
    </aside>
  );
}
