'use client';

/**
 * ProjectStage — the workshop's entry hall.
 *
 * Shown by CodeLabShell when no `workingDirectory` is selected. Two
 * surfaces:
 *
 *   1. LANDING (default)
 *      ─ Eyebrow "codelab · workshop floor"
 *      ─ Display-serif headline
 *      ─ Recent project cards (workshop-tile, animated entrance)
 *      ─ Browse folders + manual path input
 *
 *   2. BROWSE (after the user clicks "浏览文件夹" or submits a path)
 *      ─ Same eyebrow + headline at top, smaller
 *      ─ Breadcrumb + Up button
 *      ─ Folder tree, with "选择" affordance on each row
 *
 * Why one component, two surfaces: the data flow (recent list,
 * browse state, working directory mutation) is shared, and the
 * transition between the two is intentional — landing → browse →
 * select is a single ritual, not a two-page navigation. Both surfaces
 * share the warm-orb backdrop so the user doesn't lose context.
 */

import { useCallback, useState } from 'react';
import {
  ArrowUp, Clock, Folder, FolderOpen, GitBranch, Home, Loader2,
  ChevronRight, Trash2, Sparkles,
} from 'lucide-react';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import { codelabApi } from '@/lib/api-client';

interface DirEntry {
  name: string;
  path: string;
  type: string;
  isProject: boolean;
}

export function ProjectStage() {
  const setWorkingDirectory = useCodeLabStore((s) => s.setWorkingDirectory);
  const recent = useCodeLabStore((s) => s.recentDirectories);
  const removeRecentDirectory = useCodeLabStore((s) => s.removeRecentDirectory);

  const [browsing, setBrowsing] = useState(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    } catch {
      setError('目录读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualSubmit = () => {
    const dir = manualInput.trim();
    if (dir) void browse(dir);
  };

  const pathSegments = currentPath?.split('/').filter(Boolean) ?? [];

  return (
    <div className="relative h-full overflow-hidden">
      {/* Warm orb — same atmospheric token used by IdeaSpark / Writer.
          Positioned upper-left so it pools behind the headline. */}
      <div
        aria-hidden
        className="warm-orb"
        style={{ top: '12%', left: '20%', width: 540, height: 540 }}
      />

      <div className="relative h-full overflow-y-auto px-6 pt-12 pb-20">
        <div className="mx-auto w-full max-w-[720px] flex flex-col items-center text-center">
          <span
            className="atelier-eyebrow mb-5 animate-fade-in-up"
            style={{ animationDelay: '50ms' }}
          >
            codelab · workshop floor
          </span>

          <h1
            className={`text-[clamp(28px,4vw,42px)] leading-[1.15] tracking-[-0.02em] text-foreground/92 animate-fade-in-up transition-all duration-500 ${
              browsing ? 'mb-2 scale-95' : 'mb-3'
            }`}
            style={{ animationDelay: '120ms', fontFamily: 'var(--font-display)' }}
          >
            {browsing ? '选择目录开始编码。' : '在你的代码上工作。'}
          </h1>

          <p
            className="mb-10 text-[13.5px] tracking-wide text-muted-foreground/65 max-w-[540px] animate-fade-in-up"
            style={{ animationDelay: '180ms' }}
          >
            {browsing
              ? '点击项目（带 ⌥ 标记）或继续向下钻取。'
              : 'OpenCode 引擎 · MCP / LSP 集成 · 四角色协同（探索 · 规划 · 执行 · 通用）。'}
          </p>

          {/* ── LANDING ── */}
          {!browsing && (
            <div className="w-full space-y-8">
              {recent.length > 0 && <RecentGrid
                recent={recent}
                onPick={(d) => setWorkingDirectory(d)}
                onRemove={(d) => removeRecentDirectory(d)}
              />}

              <div
                className="flex items-center gap-3 max-w-[460px] mx-auto animate-fade-in-up"
                style={{ animationDelay: '320ms' }}
              >
                <span aria-hidden className="h-px flex-1 bg-border/40" />
                <span
                  className="text-[9.5px] uppercase tracking-[0.28em] text-muted-foreground/45"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  or
                </span>
                <span aria-hidden className="h-px flex-1 bg-border/40" />
              </div>

              <div
                className="flex flex-col sm:flex-row items-stretch gap-3 max-w-[520px] mx-auto animate-fade-in-up"
                style={{ animationDelay: '380ms' }}
              >
                <button
                  onClick={() => browse('~')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-warm/12 px-5 py-3 text-[13px] font-medium text-warm transition-colors hover:bg-warm/20"
                >
                  <FolderOpen className="h-4 w-4" />
                  浏览文件夹
                </button>

                <div className="flex flex-1 items-center gap-2 rounded-xl border border-border/45 bg-card/50 px-3.5 py-2.5 transition-all focus-within:border-warm/30 focus-within:bg-card/80">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground/35 shrink-0" />
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                    placeholder="或输入路径…"
                    className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/35"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                  <button
                    onClick={handleManualSubmit}
                    disabled={!manualInput.trim()}
                    className="rounded-md px-2 py-0.5 text-[10.5px] uppercase tracking-[0.18em] font-medium text-warm transition-opacity disabled:opacity-25"
                  >
                    Go
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── BROWSE ── */}
          {browsing && (
            <BrowsePane
              currentPath={currentPath}
              pathSegments={pathSegments}
              parentPath={parentPath}
              entries={entries}
              loading={loading}
              error={error}
              onBrowse={browse}
              onSelect={(d) => setWorkingDirectory(d)}
              onBack={() => setBrowsing(false)}
            />
          )}
        </div>
      </div>

      {/* Footer hint */}
      <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.28em] text-muted-foreground/30"
         style={{ fontFamily: 'var(--font-mono)' }}>
        agent works within the selected directory
      </p>
    </div>
  );
}

/* ── Recent projects grid ── */

function RecentGrid({
  recent, onPick, onRemove,
}: {
  recent: string[];
  onPick: (d: string) => void;
  onRemove: (d: string) => void;
}) {
  return (
    <div
      className="animate-fade-in-up"
      style={{ animationDelay: '260ms' }}
    >
      <div className="flex items-center gap-2 mb-4 justify-center">
        <Clock className="h-3.5 w-3.5 text-warm/55" />
        <span className="atelier-eyebrow-sm">recent projects</span>
        <span
          className="text-[10px] tabular-nums text-muted-foreground/40"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {recent.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {recent.slice(0, 6).map((dir, i) => {
          const name = dir.split('/').filter(Boolean).pop() ?? dir;
          return (
            <div
              key={dir}
              className="codelab-card group animate-fade-in-up text-left flex items-center gap-3"
              style={{ animationDelay: `${300 + i * 60}ms` }}
            >
              <button
                onClick={() => onPick(dir)}
                className="flex flex-1 items-center gap-3 min-w-0"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warm/10 text-warm">
                  <FolderOpen className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p
                    className="text-[13px] text-foreground/90 truncate"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {name}
                  </p>
                  <p
                    className="text-[10.5px] text-muted-foreground/45 truncate"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {dir}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-warm/55 transition-colors shrink-0" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(dir); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all"
                title="从最近列表移除"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Browse pane (folder tree with breadcrumb) ── */

interface BrowsePaneProps {
  currentPath: string | null;
  pathSegments: string[];
  parentPath: string | null;
  entries: DirEntry[];
  loading: boolean;
  error: string | null;
  onBrowse: (p?: string) => void;
  onSelect: (d: string) => void;
  onBack: () => void;
}

function BrowsePane({
  currentPath: _currentPath, pathSegments, parentPath, entries, loading, error,
  onBrowse, onSelect, onBack,
}: BrowsePaneProps) {
  return (
    <div className="w-full max-w-[640px] mx-auto animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-3 px-1 overflow-x-auto">
        <button
          onClick={() => onBrowse('~')}
          className="shrink-0 rounded-md p-1 text-muted-foreground/55 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
          title="工作区根目录"
        >
          <Home className="h-3.5 w-3.5" />
        </button>
        {pathSegments.map((seg, i) => {
          const segPath = '/' + pathSegments.slice(0, i + 1).join('/');
          const isLast = i === pathSegments.length - 1;
          return (
            <span key={segPath} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground/25 shrink-0" />
              <button
                onClick={() => !isLast && onBrowse(segPath)}
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${
                  isLast
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground/65 hover:text-foreground hover:bg-foreground/[0.04]'
                }`}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {seg}
              </button>
            </span>
          );
        })}
      </div>

      {/* Nav controls */}
      <div className="flex items-center gap-2 mb-3">
        {parentPath && (
          <button
            onClick={() => onBrowse(parentPath)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            <ArrowUp className="h-3 w-3" />
            上一级
          </button>
        )}
        <button
          onClick={onBack}
          className="ml-auto rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-foreground/[0.04] transition-colors"
        >
          返回
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 text-muted-foreground/45">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {error && (
        <p className="text-[12px] text-destructive text-center py-4">{error}</p>
      )}

      {!loading && (
        <div className="rounded-xl border border-border/40 bg-card/35 overflow-hidden max-h-[48vh] overflow-y-auto">
          {entries.length === 0 && !error && (
            <p className="py-8 text-center text-[11px] text-muted-foreground/30">空目录</p>
          )}
          {entries.map((entry) => (
            <div
              key={entry.path}
              className="group flex w-full items-center gap-3 border-b border-border/15 last:border-0 px-4 py-2.5 transition-colors hover:bg-foreground/[0.03]"
            >
              <button
                className="flex flex-1 items-center gap-3 min-w-0 text-left"
                onClick={() => onBrowse(entry.path)}
              >
                {entry.isProject ? (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warm/10">
                    <GitBranch className="h-3.5 w-3.5 text-warm" />
                  </div>
                ) : (
                  <Folder className="h-4 w-4 text-muted-foreground/40 shrink-0 ml-1.5 mr-0.5" />
                )}
                <span
                  className={`flex-1 truncate text-[12.5px] ${
                    entry.isProject ? 'font-medium text-foreground/90' : 'text-muted-foreground'
                  }`}
                  style={entry.isProject ? { fontFamily: 'var(--font-display)' } : { fontFamily: 'var(--font-mono)' }}
                >
                  {entry.name}
                </span>
              </button>
              <button
                className="shrink-0 rounded-full bg-warm/10 px-2.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.18em] text-warm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-warm/20"
                onClick={() => onSelect(entry.path)}
              >
                选择
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
