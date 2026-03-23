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
    <aside className="flex h-full w-16 flex-col items-center border-r bg-card py-4 lg:w-56">
      <Link href="/" className="mb-6 flex items-center gap-2 px-3">
        <Image src="/logo.png" alt="SoloLab" width={32} height={32} className="h-8 w-8 object-contain" />
        <span className="hidden text-lg font-bold lg:block">SoloLab</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-2 w-full">
        {modules.map((mod) => {
          const Icon = mod.icon;
          const isActive = currentModule === mod.id;

          if (!mod.ready) {
            return (
              <div
                key={mod.id}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/50 cursor-not-allowed"
                title="即将推出"
              >
                <Icon className="h-5 w-5 shrink-0" />
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
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{mod.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pt-4 border-t w-full">
        <p className="hidden text-[10px] text-muted-foreground/60 text-center lg:block">
          Powered By Suxiang.Huang
        </p>
      </div>
    </aside>
  );
}
