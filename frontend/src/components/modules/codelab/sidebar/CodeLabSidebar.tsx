'use client';

/**
 * CodeLabSidebar — composes the four atelier sections.
 *
 *   ┌──────────────────┐
 *   │  ProjectTile     │ ← workshop-tile with switch dropdown
 *   ├──────────────────┤
 *   │  SessionList     │ ← flex-1, scrollable; sessions for this dir
 *   ├──────────────────┤
 *   │  ChangesList     │ ← collapses if no modified files
 *   ├──────────────────┤
 *   │  CostPill        │ ← collapses if cost is 0
 *   └──────────────────┘
 *
 * Sections are separated by `.soft-divider` so the boundaries fade
 * rather than slice. When the workshop is idle (no project picked,
 * which the parent route prevents from reaching here, but still:),
 * we render a quiet "no project selected" placeholder rather than
 * a stack of empty sections.
 */

import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import { ProjectTile } from './ProjectTile';
import { SessionList } from './SessionList';
import { ChangesList } from './ChangesList';
import { CostPill } from './CostPill';

export function CodeLabSidebar({ moduleId: _moduleId }: { moduleId: string }) {
  const workingDirectory = useCodeLabStore((s) => s.workingDirectory);
  const recentDirectories = useCodeLabStore((s) => s.recentDirectories);
  const setWorkingDirectory = useCodeLabStore((s) => s.setWorkingDirectory);
  const leaveDirectory = useCodeLabStore((s) => s.leaveDirectory);
  const removeRecentDirectory = useCodeLabStore((s) => s.removeRecentDirectory);
  const files = useCodeLabStore((s) => s.files);
  const costUsd = useCodeLabStore((s) => s.costUsd);

  if (!workingDirectory) {
    return (
      <div className="flex h-full flex-col">
        <span className="atelier-eyebrow mb-2">project</span>
        <p className="text-[11px] text-muted-foreground/35 px-1">
          先在主面板选择一个工作目录。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ProjectTile
        workingDirectory={workingDirectory}
        recentDirectories={recentDirectories}
        onSwitchTo={(d) => setWorkingDirectory(d)}
        onLeave={() => leaveDirectory()}
        onRemoveRecent={(d) => removeRecentDirectory(d)}
      />

      <span aria-hidden className="soft-divider my-4 block" />

      <SessionList workingDirectory={workingDirectory} />

      {files.filter((f) => f.status !== 'read').length > 0 && (
        <>
          <span aria-hidden className="soft-divider my-4 block" />
          <ChangesList files={files} />
        </>
      )}

      {costUsd > 0 && (
        <>
          <span aria-hidden className="soft-divider my-4 block" />
          <CostPill costUsd={costUsd} />
        </>
      )}
    </div>
  );
}
