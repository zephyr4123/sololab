'use client';

/**
 * ChangesList — modified files in the current session, rendered as
 * a stack of paper slips. Read-only files are filtered out — this
 * section is for "what got marked up this session," not "what got
 * looked at."
 *
 * Status mapping (CodeLab store → UI):
 *   modified → '✎'   (edited in place)
 *   created  → '✦'   (newly written)
 *   deleted  → '⌁'   (removed)
 *
 * Section hides itself entirely if there are no modified files —
 * an empty "Changes (0)" header is dead weight in the sidebar.
 */

import type { CodeLabFile } from '@/stores/module-stores/codelab-store';

const STATUS_GLYPH: Record<CodeLabFile['status'], string> = {
  read: '·',
  modified: '✎',
  created: '✦',
  deleted: '⌁',
};

const STATUS_COLOR: Record<CodeLabFile['status'], string> = {
  read: 'var(--color-muted-foreground)',
  modified: 'var(--color-warm)',
  created: '#6B8E5A',
  deleted: 'var(--color-destructive)',
};

export function ChangesList({ files }: { files: CodeLabFile[] }) {
  const modified = files.filter((f) => f.status !== 'read');
  if (modified.length === 0) return null;

  return (
    <div>
      <div className="atelier-eyebrow flex items-center justify-between mb-2.5">
        <span>changes</span>
        <span
          className="tabular-nums text-muted-foreground/45 text-[9.5px]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {modified.length}
        </span>
      </div>

      <div className="space-y-px">
        {modified.slice(0, 8).map((f) => {
          const name = f.path.split('/').pop() ?? f.path;
          return (
            <div key={f.path} className="changes-slip">
              <span
                className="text-[12px] leading-none"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: STATUS_COLOR[f.status],
                  opacity: 0.85,
                }}
                aria-hidden
              >
                {STATUS_GLYPH[f.status]}
              </span>
              <span
                className="truncate text-[10.5px] text-foreground/75"
                style={{ fontFamily: 'var(--font-mono)' }}
                title={f.path}
              >
                {name}
              </span>
              <span
                className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/40"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {f.status}
              </span>
            </div>
          );
        })}
        {modified.length > 8 && (
          <p
            className="px-1.5 pt-1 text-[9.5px] text-muted-foreground/35"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            + {modified.length - 8} more
          </p>
        )}
      </div>
    </div>
  );
}
