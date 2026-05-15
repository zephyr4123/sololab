/**
 * ToolMeta — display metadata for the OpenCode tool catalogue, plus the
 * tiny utilities that everyone reaches for when handling tool input:
 *
 *   getTool(name)                — lucide icon + caps eyebrow + category
 *   extractFilePath(input)       — uniform read of file_path / filePath / path
 *   toolFileStatus(name)         — derive 'read' | 'modified' for sidebar
 *
 * Why these live together: the file-path field naming varies between OpenCode
 * versions (snake_case in newer, camelCase in older), and the "which tools
 * count as writes" question is metadata about a tool, not about the call site.
 * Putting both with the metadata table keeps the rest of the module from
 * re-deriving the same logic in three places.
 */

import {
  Eye, Pencil, FileText, FolderSearch, Search,
  Terminal, Globe, Sparkles, type LucideIcon,
} from 'lucide-react';

export type ToolCategory = 'read' | 'write' | 'search' | 'shell' | 'web' | 'meta';

export interface ToolMeta {
  icon: LucideIcon;
  eyebrow: string;
  category: ToolCategory;
}

export const TOOLS: Record<string, ToolMeta> = {
  read:      { icon: Eye,          eyebrow: 'READ',   category: 'read' },
  edit:      { icon: Pencil,       eyebrow: 'EDIT',   category: 'write' },
  write:     { icon: FileText,     eyebrow: 'WRITE',  category: 'write' },
  multiedit: { icon: Pencil,       eyebrow: 'EDIT',   category: 'write' },
  apply_patch: { icon: Pencil,     eyebrow: 'PATCH',  category: 'write' },
  glob:      { icon: FolderSearch, eyebrow: 'GLOB',   category: 'search' },
  grep:      { icon: Search,       eyebrow: 'GREP',   category: 'search' },
  bash:      { icon: Terminal,     eyebrow: 'SHELL',  category: 'shell' },
  webfetch:  { icon: Globe,        eyebrow: 'FETCH',  category: 'web' },
  websearch: { icon: Globe,        eyebrow: 'SEARCH', category: 'web' },
  task:      { icon: Sparkles,     eyebrow: 'TASK',   category: 'meta' },
};

const FALLBACK: ToolMeta = { icon: Terminal, eyebrow: 'TOOL', category: 'meta' };

export function getTool(name: string | undefined | null): ToolMeta {
  if (!name) return FALLBACK;
  return TOOLS[name] ?? { ...FALLBACK, eyebrow: name.toUpperCase() };
}

/** Tools whose primary input is a file path */
export const FILE_TOOLS = new Set(['read', 'edit', 'write', 'multiedit', 'apply_patch']);

/** Tools whose primary input is a pattern / search expression */
export const PATTERN_TOOLS = new Set(['glob', 'grep']);

/**
 * Pull a file path out of OpenCode tool input. OpenCode sometimes emits
 * snake_case, sometimes camelCase, sometimes the bare `path` key — accept
 * all three and return `''` (never undefined) so callers can chain freely.
 */
export function extractFilePath(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const inp = input as Record<string, unknown>;
  const v = inp.file_path ?? inp.filePath ?? inp.path ?? inp.filepath;
  return typeof v === 'string' ? v : '';
}

/**
 * Map a tool name to the file-status it implies for the sidebar's
 * ChangesList:
 *   - read-y tools (read / glob / grep / list / codesearch) → 'read'
 *   - write-y tools (edit / write / multiedit / apply_patch) → 'modified'
 *   - everything else → null (don't add to the file list)
 *
 * The categories live on the ToolMeta entry, with `glob` / `grep` /
 * `codesearch` as explicit additions because they imply the user is *looking*
 * at code even though they don't take a single file_path.
 */
export function toolFileStatus(tool: string): 'read' | 'modified' | null {
  const meta = TOOLS[tool];
  if (meta?.category === 'write') return 'modified';
  if (meta?.category === 'read') return 'read';
  if (tool === 'list' || tool === 'codesearch') return 'read';
  return null;
}

export function shortPath(p: unknown): string {
  if (!p || typeof p !== 'string') return '';
  const segs = p.split('/').filter(Boolean);
  if (segs.length <= 3) return segs.join('/');
  return '…/' + segs.slice(-2).join('/');
}
