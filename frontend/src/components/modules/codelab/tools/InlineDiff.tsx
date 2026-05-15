'use client';

/**
 * InlineDiff — fallback diff renderer used when only `old_string` /
 * `new_string` are available (e.g. an `edit` tool call where the
 * full before/after content didn't make it into the SSE payload).
 *
 * Renders the two blocks stacked rather than interleaved — there's
 * no line correspondence to display, so faking one would be worse
 * than showing the literal `−` block above the `+` block.
 */

import { useState } from 'react';

export function InlineDiff({ oldStr, newStr }: { oldStr?: string; newStr?: string }) {
  if (!oldStr && !newStr) return null;
  const oldLines = oldStr ? oldStr.split('\n') : [];
  const newLines = newStr ? newStr.split('\n') : [];
  const total = oldLines.length + newLines.length;
  const [open, setOpen] = useState(total <= 10);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1 font-mono text-[10px] tracking-wide text-muted-foreground/35 transition-colors hover:text-muted-foreground/65"
      >
        {total} 行修改 &rsaquo;
      </button>
    );
  }

  return (
    <div className="codelab-diff-shell">
      {oldLines.map((line, i) => (
        <div key={`o${i}`} className="codelab-diff-row-rem px-2.5 py-[1px] text-foreground/55">
          <span className="codelab-diff-sign-rem inline-block w-3.5 text-right select-none mr-2">−</span>
          {line}
        </div>
      ))}
      {newLines.map((line, i) => (
        <div key={`n${i}`} className="codelab-diff-row-add px-2.5 py-[1px] text-foreground/55">
          <span className="codelab-diff-sign-add inline-block w-3.5 text-right select-none mr-2">+</span>
          {line}
        </div>
      ))}
    </div>
  );
}
