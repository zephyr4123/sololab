'use client';

/**
 * ActSlot — accordion-style wrapper around an Act body.
 *
 * Layout rules:
 *   - state="active"  → header + body, body has a bounded max-height with
 *                       internal scroll so the four acts always fit on
 *                       one screen and the active one carries the focus.
 *   - state="done"    → header only, click to expand inline (no scroll
 *                       constraint — completed content is small enough
 *                       that the outer scroll handles it).
 *   - state="pending" → header only, no toggle affordance.
 *
 * The header (eyebrow + roman + status pill) is owned by this slot so
 * Act bodies only render their phase-specific content.
 */

import { ReactNode, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ActHeader, type ActState } from './ActHeader';
import type { PhaseId } from '../../shared/PersonaMeta';

interface ActSlotProps {
  phase: PhaseId;
  state: ActState;
  meta?: ReactNode;
  children: ReactNode;
}

export function ActSlot({ phase, state, meta, children }: ActSlotProps) {
  // Active is always open. Done acts default closed but can be expanded.
  // Pending acts are always closed and never toggleable.
  const [open, setOpen] = useState(state === 'active');

  useEffect(() => {
    if (state === 'active') setOpen(true);
  }, [state]);

  const canToggle = state === 'done';
  const showBody = state === 'active' || open;

  return (
    <section className="relative">
      <div
        role={canToggle ? 'button' : undefined}
        tabIndex={canToggle ? 0 : -1}
        onClick={canToggle ? () => setOpen((o) => !o) : undefined}
        onKeyDown={(e) => {
          if (canToggle && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={`flex items-center gap-2 -mx-1 px-1 py-1 rounded-md transition-colors ${
          canToggle ? 'cursor-pointer hover:bg-foreground/[0.025]' : ''
        }`}
      >
        <div className="flex-1 min-w-0">
          <ActHeader phase={phase} state={state} meta={meta} />
        </div>
        {canToggle && (
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        )}
      </div>

      {showBody && (
        <div
          className={
            state === 'active'
              ? 'mt-4 max-h-[clamp(280px,42vh,520px)] min-h-[160px] overflow-y-auto pr-1 act-scroll'
              : 'mt-4 animate-fade-in'
          }
        >
          {children}
        </div>
      )}
    </section>
  );
}
