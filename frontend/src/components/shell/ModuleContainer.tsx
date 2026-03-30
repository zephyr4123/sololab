'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  MessageSquare, Lightbulb, FileText, FolderOpen, Terminal,
  Code, Eye, Map, Wrench, Cpu, Search,
} from 'lucide-react';
import '@/lib/register-modules';
import { getModulePlugin } from '@/lib/module-loader';

/** Map icon names → Lucide components */
const ICON_MAP: Record<string, typeof MessageSquare> = {
  MessageSquare, Lightbulb, FileText, FolderOpen, Terminal,
  Code, Eye, Map, Wrench, Cpu, Search,
};

interface ModuleContainerProps {
  moduleId: string;
}

export function ModuleContainer({ moduleId }: ModuleContainerProps) {
  const plugin = useMemo(() => getModulePlugin(moduleId), [moduleId]);
  const tabs = plugin?.tabs ?? [];
  const defaultTab = tabs[0]?.id ?? 'chat';

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [visited, setVisited] = useState<Set<string>>(new Set([defaultTab]));

  const switchTab = useCallback(
    (id: string) => {
      setActiveTab(id);
      setVisited((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    },
    [],
  );

  if (!plugin) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Module &ldquo;{moduleId}&rdquo; not found or not registered.</p>
      </div>
    );
  }

  const SidebarComponent = plugin.sidebar?.component;

  return (
    <div className="flex h-full min-h-0 gap-5">
      {/* Main content area */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {/* Tab bar */}
        <div className="mb-4 flex items-center gap-1 border-b border-border/50">
          {tabs.map((tab) => {
            const Icon = ICON_MAP[tab.icon] ?? Code;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-4 pb-2.5 pt-1 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground/60 hover:text-muted-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {isActive && (
                  <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[var(--color-warm)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content — lazy rendering via visited set */}
        {tabs.map((tab) => {
          const Component = tab.component;
          const isActive = activeTab === tab.id;
          const isFirstTab = tab.id === defaultTab;

          // Always render first tab; other tabs render after first visit
          if (!isFirstTab && !visited.has(tab.id)) return null;

          return (
            <div
              key={tab.id}
              className={isActive ? 'flex flex-1 flex-col min-h-0' : 'hidden'}
            >
              <Component moduleId={moduleId} />
            </div>
          );
        })}
      </div>

      {/* Right sidebar */}
      {SidebarComponent && (
        <aside className="hidden w-72 min-h-0 overflow-y-auto border-l border-border/40 pl-5 xl:block space-y-6">
          <SidebarComponent moduleId={moduleId} />
        </aside>
      )}
    </div>
  );
}
