'use client';

import { useMemo, useState } from 'react';
import { MessageSquare, Lightbulb, FileText, Code, PenTool, BarChart3, BookOpen, Search } from 'lucide-react';
import '@/lib/register-modules';
import { getModulePlugin } from '@/lib/module-loader';

interface ModuleContainerProps {
  moduleId: string;
}

const TAB_ICON_MAP: Record<string, typeof MessageSquare> = {
  MessageSquare, Lightbulb, FileText, Code, PenTool, BarChart3, BookOpen, Search,
};

export function ModuleContainer({ moduleId }: ModuleContainerProps) {
  const plugin = useMemo(() => getModulePlugin(moduleId), [moduleId]);

  // Fallback local state for plugins without external tab controller (e.g. CodeLab)
  const [localTab, setLocalTab] = useState<string>(plugin?.tabs[0]?.id ?? '');
  // Plugin may bind tab state to a module store (IdeaSpark binds to ideaspark-store.activeTab)
  const controller = plugin?.useTabController?.();
  const activeTab = controller?.activeTab ?? localTab;
  const setActiveTab = controller?.setActiveTab ?? setLocalTab;

  if (!plugin) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Module &ldquo;{moduleId}&rdquo; not found or not registered.</p>
      </div>
    );
  }

  const currentTab = plugin.tabs.find((t) => t.id === activeTab) ?? plugin.tabs[0];
  const MainComponent = currentTab?.component;
  const SidebarComponent = plugin.sidebar?.component;

  if (!MainComponent) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Module &ldquo;{moduleId}&rdquo; has no content component.</p>
      </div>
    );
  }

  // Show TabBar only when plugin has more than one tab
  const showTabBar = plugin.tabs.length > 1;

  return (
    <div className="flex h-full min-h-0 gap-5">
      {/* Main content */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {showTabBar && (
          <div className="flex items-center gap-1 px-2 pb-2 border-b border-border/30 mb-2">
            {plugin.tabs.map((tab) => {
              const Icon = TAB_ICON_MAP[tab.icon] ?? MessageSquare;
              const isActive = tab.id === currentTab?.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                    isActive
                      ? 'bg-[var(--color-warm)]/10 text-[var(--color-warm)]'
                      : 'text-muted-foreground/55 hover:text-foreground hover:bg-foreground/[0.03]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-1 flex-col min-h-0">
          <MainComponent moduleId={moduleId} />
        </div>
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
