'use client';

import { useState, useCallback } from 'react';
import {
  FolderOpen, Folder, ArrowRight, Clock, Trash2, Terminal,
  ChevronRight, Home, ArrowUp, GitBranch, Loader2,
} from 'lucide-react';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import { codelabApi } from '@/lib/api-client';

interface DirEntry {
  name: string;
  path: string;
  type: string;
  isProject: boolean;
}

export function ProjectSelector() {
  const setWorkingDirectory = useCodeLabStore((s) => s.setWorkingDirectory);
  const recent = useCodeLabStore((s) => s.recentDirectories);
  const removeRecentDirectory = useCodeLabStore((s) => s.removeRecentDirectory);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [manualInput, setManualInput] = useState('');

  const browse = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await codelabApi.browse(path);
      setCurrentPath(result.path);
      setParentPath(result.parent);
      setEntries(result.entries);
      setBrowsing(true);
      if (result.error) setError(result.error);
    } catch (e) {
      setError('Failed to browse directory');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectProject = (dir: string) => {
    setWorkingDirectory(dir);
  };

  const removeRecent = (dir: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeRecentDirectory(dir);
  };

  const handleManualSubmit = () => {
    const dir = manualInput.trim();
    if (dir) selectProject(dir);
  };

  // Breadcrumb segments
  const pathSegments = currentPath?.split('/').filter(Boolean) ?? [];

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <div className="w-full max-w-xl animate-fade-in-up">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-warm)]/10 border border-[var(--color-warm)]/20">
            <Terminal className="h-7 w-7 text-[var(--color-warm)]" />
          </div>
          <h2 className="text-xl font-semibold mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
            CodeLab
          </h2>
          <p className="text-sm text-muted-foreground">
            {browsing ? 'Select a project folder' : 'Choose a project to start coding'}
          </p>
        </div>

        {!browsing ? (
          /* ── Landing: Recent + Browse/Manual ── */
          <div className="space-y-6">

            {/* Recent projects */}
            {recent.length > 0 && (
              <div className="animate-fade-in">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/40">
                    Recent Projects
                  </span>
                </div>
                <div className="space-y-1">
                  {recent.map((dir) => {
                    const name = dir.split('/').filter(Boolean).pop() ?? dir;
                    return (
                      <button
                        key={dir}
                        onClick={() => selectProject(dir)}
                        className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left border border-transparent transition-all hover:bg-foreground/[0.03] hover:border-border/40"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-warm)]/8 group-hover:bg-[var(--color-warm)]/12 transition-colors">
                          <FolderOpen className="h-4 w-4 text-[var(--color-warm)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground/40 truncate">{dir}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
                        <Trash2
                          className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/30 hover:!text-destructive transition-colors"
                          onClick={(e) => removeRecent(dir, e)}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => browse('~')}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-card/60 px-4 py-3 text-sm font-medium transition-all hover:border-[var(--color-warm)]/30 hover:bg-card"
              >
                <FolderOpen className="h-4 w-4 text-[var(--color-warm)]" />
                Browse Folders
              </button>
            </div>

            {/* Manual input (collapsed) */}
            <details className="group">
              <summary className="text-[11px] text-muted-foreground/40 cursor-pointer hover:text-muted-foreground/60 text-center">
                Or enter path manually
              </summary>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/50 bg-card/60 px-3 py-2">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                  placeholder="/path/to/project"
                  className="flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground/30"
                />
                <button
                  onClick={handleManualSubmit}
                  disabled={!manualInput.trim()}
                  className="rounded-lg bg-[var(--color-warm)]/10 px-3 py-1.5 text-xs font-medium text-[var(--color-warm)] disabled:opacity-30"
                >
                  Open
                </button>
              </div>
            </details>
          </div>
        ) : (
          /* ── Folder Browser ── */
          <div className="animate-fade-in">

            {/* Breadcrumb bar */}
            <div className="flex items-center gap-1 mb-4 px-1 overflow-x-auto">
              <button
                onClick={() => browse('/')}
                className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
              >
                <Home className="h-3.5 w-3.5" />
              </button>

              {pathSegments.map((seg, i) => {
                const segPath = '/' + pathSegments.slice(0, i + 1).join('/');
                const isLast = i === pathSegments.length - 1;
                return (
                  <span key={segPath} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-muted-foreground/20 shrink-0" />
                    <button
                      onClick={() => !isLast && browse(segPath)}
                      className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                        isLast
                          ? 'text-foreground font-medium'
                          : 'text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.04]'
                      }`}
                    >
                      {seg}
                    </button>
                  </span>
                );
              })}
            </div>

            {/* Navigation controls */}
            <div className="flex items-center gap-2 mb-3">
              {parentPath && (
                <button
                  onClick={() => browse(parentPath)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-foreground/[0.04] transition-colors"
                >
                  <ArrowUp className="h-3 w-3" />
                  Up
                </button>
              )}
              <button
                onClick={() => setBrowsing(false)}
                className="ml-auto rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-foreground/[0.04] transition-colors"
              >
                Back
              </button>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground/40">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-xs text-destructive text-center py-4">{error}</p>
            )}

            {/* Directory list */}
            {!loading && (
              <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden max-h-[45vh] overflow-y-auto">
                {entries.length === 0 && !error && (
                  <p className="py-8 text-center text-[11px] text-muted-foreground/30">Empty directory</p>
                )}

                {entries.map((entry) => (
                  <div
                    key={entry.path}
                    className="group flex w-full items-center gap-3 border-b border-border/20 last:border-0 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
                  >
                    {/* Click folder icon / name area → browse into directory */}
                    <button
                      className="flex flex-1 items-center gap-3 min-w-0"
                      onClick={() => browse(entry.path)}
                    >
                      {entry.isProject ? (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-warm)]/10">
                          <GitBranch className="h-3.5 w-3.5 text-[var(--color-warm)]" />
                        </div>
                      ) : (
                        <Folder className="h-4 w-4 text-muted-foreground/40 shrink-0 ml-1.5 mr-0.5" />
                      )}
                      <span className={`flex-1 truncate text-sm ${entry.isProject ? 'font-medium' : 'text-muted-foreground'}`}>
                        {entry.name}
                      </span>
                    </button>

                    {/* Select button → choose this directory as workspace */}
                    <button
                      className="shrink-0 rounded-full bg-[var(--color-warm)]/8 px-2.5 py-0.5 text-[9px] font-medium text-[var(--color-warm)] uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--color-warm)]/15"
                      onClick={() => selectProject(entry.path)}
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer hint */}
        <p className="mt-6 text-center text-[10px] text-muted-foreground/25">
          The agent will work within the selected directory
        </p>
      </div>
    </div>
  );
}
