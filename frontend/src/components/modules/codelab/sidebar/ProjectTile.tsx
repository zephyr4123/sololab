'use client';

/**
 * ProjectTile — the sidebar's top section.
 *
 * One workshop tile: display-serif project name, mono path beneath,
 * subtle atelier rim. Clicking it expands a dropdown of recent
 * directories with one-click switching + per-row remove.
 *
 * The "switch project" action lives here AND in CodeLabContextStrip;
 * both routes do the same thing (`leaveDirectory()`) and that's fine —
 * users in the sidebar context expect a sidebar control; users with
 * the chat in focus expect a top-bar control.
 */

import { useState } from 'react';
import { ArrowLeftRight, ChevronDown, FolderOpen, Plus, Trash2 } from 'lucide-react';

interface ProjectTileProps {
  workingDirectory: string;
  recentDirectories: string[];
  onSwitchTo: (dir: string) => void;
  onLeave: () => void;
  onRemoveRecent: (dir: string) => void;
}

export function ProjectTile({
  workingDirectory, recentDirectories, onSwitchTo, onLeave, onRemoveRecent,
}: ProjectTileProps) {
  const [expanded, setExpanded] = useState(false);
  const dirName = workingDirectory.split('/').filter(Boolean).pop() ?? workingDirectory;
  const others = recentDirectories.filter((d) => d !== workingDirectory);

  return (
    <div>
      <div
        className="atelier-eyebrow flex items-center justify-between mb-2"
      >
        <span>project</span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-1 text-muted-foreground/35 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-colors"
          title="切换项目"
        >
          <ArrowLeftRight className="h-3 w-3" />
        </button>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="workshop-tile w-full text-left group"
      >
        <div className="relative flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warm/12">
            <FolderOpen className="h-4 w-4 text-warm" />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="truncate text-[13.5px] text-foreground/90"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {dirName}
            </p>
            <p
              className="truncate text-[10px] tracking-tight text-muted-foreground/45"
              style={{ fontFamily: 'var(--font-mono)' }}
              title={workingDirectory}
            >
              {workingDirectory}
            </p>
          </div>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {expanded && (
        <div className="mt-2 rounded-xl bg-card/40 p-1.5 space-y-0.5 animate-fade-in shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-border)_45%,transparent)]">
          {others.slice(0, 5).map((dir) => (
            <div
              key={dir}
              className="group/dir flex items-center rounded-md hover:bg-foreground/[0.04] transition-colors"
            >
              <button
                onClick={() => { onSwitchTo(dir); setExpanded(false); }}
                className="flex flex-1 items-center gap-2 px-2 py-1.5 min-w-0 text-left"
              >
                <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                <span
                  className="truncate text-[11px] text-muted-foreground"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {dir.split('/').filter(Boolean).pop()}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveRecent(dir); }}
                className="p-1 mr-1 rounded opacity-0 group-hover/dir:opacity-100 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all"
                title="从最近列表移除"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}

          <button
            onClick={() => { onLeave(); setExpanded(false); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-warm transition-colors hover:bg-warm/8"
          >
            <Plus className="h-3 w-3" />
            其他项目…
          </button>
        </div>
      )}
    </div>
  );
}
