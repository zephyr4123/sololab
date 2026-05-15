/**
 * normalize — single source of truth for OpenCode tool-part → CodeLabToolCall.
 *
 * Two callers need this conversion and *must* stay in sync:
 *
 *   1. opencode-client.ts (live SSE)   — every message.part.updated of type
 *      tool comes through here, both parent thread and child (parallel agent)
 *      sessions.
 *   2. sidebar/SessionList.tsx (history) — when the user clicks an old
 *      session, the full message list is fetched from OpenCode and replayed
 *      into the store. The replayed tool calls must look identical to what
 *      live streaming produced, or expanding an old "edit" won't render its
 *      diff.
 *
 * Previously the live path lifted fileDiff/isNewFile only in the parent
 * branch, while the child branch passed bare tool data through — meaning
 * subagent edits silently lost their diff. This normalizer is symmetric
 * across both branches.
 */

import type { CodeLabToolCall, FileDiff } from '@/stores/module-stores/codelab-store';

/**
 * OpenCode message-part shape. Loosely typed because we accept the raw
 * SSE event object — only the fields we care about are described here.
 */
export interface OcToolPart {
  id?: string;
  tool?: string;
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    output?: string;
    title?: string;
    metadata?: Record<string, unknown>;
    time?: { start?: number; end?: number };
  };
}

function extractFileDiff(part: OcToolPart): FileDiff | undefined {
  const tool = part.tool;
  if (tool !== 'edit' && tool !== 'multiedit' && tool !== 'apply_patch') return undefined;
  if (part.state?.status !== 'completed') return undefined;

  const fd = part.state?.metadata?.filediff as Record<string, unknown> | undefined;
  if (!fd) return undefined;
  return {
    file:       (fd.file as string) ?? '',
    additions:  (fd.additions as number) ?? 0,
    deletions:  (fd.deletions as number) ?? 0,
    before:     (fd.before as string) ?? '',
    after:      (fd.after as string) ?? '',
  };
}

function extractIsNewFile(part: OcToolPart): boolean | undefined {
  if (part.tool !== 'write' || part.state?.status !== 'completed') return undefined;
  return !(part.state.metadata?.exists as boolean ?? true);
}

/**
 * Build a store-shaped CodeLabToolCall from an OpenCode tool part.
 * `idHint` lets the caller pass a stable identifier (e.g. message part id from
 * history, or a generated one for live). When omitted, a random id is used.
 */
export function normalizeOcTool(part: OcToolPart, idHint?: string): CodeLabToolCall {
  const state = part.state ?? {};
  const status = (state.status as CodeLabToolCall['status']) ?? 'running';
  const output = status === 'completed' ? ((state.output as string) ?? '') : '';

  return {
    id:        idHint ?? `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    tool:      part.tool ?? 'unknown',
    input:     (state.input as Record<string, unknown>) ?? {},
    output,
    status,
    title:     (state.title as string) ?? part.tool ?? 'unknown',
    timestamp: state.time?.start ?? Date.now(),
    fileDiff:  extractFileDiff(part),
    isNewFile: extractIsNewFile(part),
  };
}
