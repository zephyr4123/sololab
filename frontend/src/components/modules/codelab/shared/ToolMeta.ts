/**
 * ToolMeta — display metadata for the OpenCode tool catalogue.
 *
 * Keeps the lucide icon (the literal "what the tool does") but adds:
 *   - `eyebrow` — atelier-eyebrow string ("READ", "EDIT", "BASH"…)
 *     used as the small caps badge on every ToolCallCard header
 *   - `defaultBadge` — fallback right-side metric for tools where the
 *     output doesn't have an obvious numeric summary
 *
 * Why this exists: ToolCallCard previously hard-coded label strings
 * inside its renderer. Pulling them out lets ForkDiagram's spoke rows
 * reuse the same vocabulary without duplicating the mapping.
 */

import {
  Eye, Pencil, FileText, FolderSearch, Search,
  Terminal, Globe, FilePlus, Sparkles, type LucideIcon,
} from 'lucide-react';

export interface ToolMeta {
  icon: LucideIcon;
  eyebrow: string;
  /** Optional category — used by SkillPicker / docs but not strictly needed for cards */
  category: 'read' | 'write' | 'search' | 'shell' | 'web' | 'meta';
}

export const TOOLS: Record<string, ToolMeta> = {
  read:      { icon: Eye,          eyebrow: 'READ',   category: 'read' },
  edit:      { icon: Pencil,       eyebrow: 'EDIT',   category: 'write' },
  write:     { icon: FileText,     eyebrow: 'WRITE',  category: 'write' },
  multiedit: { icon: Pencil,       eyebrow: 'EDIT',   category: 'write' },
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
export const FILE_TOOLS = new Set(['read', 'edit', 'write', 'multiedit']);

/** Tools whose primary input is a pattern / search expression */
export const PATTERN_TOOLS = new Set(['glob', 'grep']);

export function shortPath(p: unknown): string {
  if (!p || typeof p !== 'string') return '';
  const segs = p.split('/').filter(Boolean);
  if (segs.length <= 3) return segs.join('/');
  return '…/' + segs.slice(-2).join('/');
}
