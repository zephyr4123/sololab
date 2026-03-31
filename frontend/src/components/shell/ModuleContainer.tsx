'use client';

import { useMemo } from 'react';
import '@/lib/register-modules';
import { getModulePlugin } from '@/lib/module-loader';

interface ModuleContainerProps {
  moduleId: string;
}

export function ModuleContainer({ moduleId }: ModuleContainerProps) {
  const plugin = useMemo(() => getModulePlugin(moduleId), [moduleId]);

  if (!plugin) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Module &ldquo;{moduleId}&rdquo; not found or not registered.</p>
      </div>
    );
  }

  const MainComponent = plugin.tabs[0]?.component;
  const SidebarComponent = plugin.sidebar?.component;

  if (!MainComponent) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Module &ldquo;{moduleId}&rdquo; has no content component.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-5">
      {/* Main content — full width, no tabs */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        <MainComponent moduleId={moduleId} />
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
