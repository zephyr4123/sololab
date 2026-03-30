'use client';

import { FileText, FilePlus, FileEdit, Trash2, FolderOpen } from 'lucide-react';
import { useCodeLabStore, type CodeLabFile } from '@/stores/module-stores/codelab-store';

const STATUS_CONFIG: Record<CodeLabFile['status'], { icon: typeof FileText; color: string; label: string }> = {
  read:     { icon: FileText, color: 'text-muted-foreground',   label: 'Read' },
  modified: { icon: FileEdit, color: 'text-[var(--color-warm)]', label: 'Modified' },
  created:  { icon: FilePlus, color: 'text-emerald-500',         label: 'Created' },
  deleted:  { icon: Trash2,   color: 'text-destructive',         label: 'Deleted' },
};

export function FileExplorer({ moduleId }: { moduleId: string }) {
  const files = useCodeLabStore((s) => s.files);

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 opacity-50">
        <FolderOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          No files tracked yet. Start a conversation to explore or modify files.
        </p>
      </div>
    );
  }

  // Group by directory
  const grouped = new Map<string, CodeLabFile[]>();
  for (const f of files) {
    const parts = f.path.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    if (!grouped.has(dir)) grouped.set(dir, []);
    grouped.get(dir)!.push(f);
  }

  return (
    <div className="flex flex-col min-h-0 overflow-y-auto p-3 space-y-4">
      <div className="flex items-center gap-2 px-1 mb-1">
        <FolderOpen className="h-4 w-4 text-[var(--color-warm)]" />
        <h3 className="text-sm font-semibold">Files ({files.length})</h3>
      </div>

      {Array.from(grouped.entries()).map(([dir, dirFiles]) => (
        <div key={dir}>
          <p className="flex items-center gap-1.5 px-1 mb-1.5 text-[11px] font-mono text-muted-foreground/60 uppercase tracking-wider">
            {dir}
          </p>
          <div className="space-y-0.5">
            {dirFiles.map((f) => {
              const cfg = STATUS_CONFIG[f.status];
              const Icon = cfg.icon;
              const filename = f.path.split('/').pop() ?? f.path;

              return (
                <div
                  key={f.path}
                  className="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-foreground/[0.04]"
                  title={`${f.path} (${cfg.label})`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                  <span className="flex-1 truncate font-mono text-xs">{filename}</span>
                  {f.language && (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                      {f.language}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
