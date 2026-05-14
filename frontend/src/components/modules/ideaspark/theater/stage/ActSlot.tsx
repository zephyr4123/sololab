'use client';

/**
 * ActSlot — accordion-style wrapper around an Act body.
 *
 * Layout rules:
 *   - state="active"  → header + body. Body is height-bounded
 *                       (~42vh, capped at 520px) with internal scroll so
 *                       all four acts stay on one screen and the active
 *                       one carries focus. min-h keeps streaming
 *                       content from making the surface jitter.
 *   - state="done"    → header only by default; clicking expands the
 *                       body inline. Expanded body is ALSO height-bounded
 *                       (~58vh, capped at 640px) with internal scroll.
 *                       A single Act can run thousands of pixels of
 *                       agent output + tool calls + inline citations;
 *                       an unbounded done-body would push the remaining
 *                       acts (and the stage chrome) clean off-screen.
 *   - state="pending" → header only, no toggle affordance.
 *
 * The header (eyebrow + roman + status pill) is owned by this slot so
 * Act bodies only render their phase-specific content.
 */

import { ReactNode, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ActHeader, type ActState } from './ActHeader';
import type { PhaseId } from '../../shared/PersonaMeta';

/* Body presentation rules.
 *
 * Scroll behavior (overflow + thin warm scrollbar via .act-scroll) is
 * shared between active and expanded states; what differs is the height
 * envelope. Keeping these as named constants makes it explicit that
 * "active Act gets one envelope, expanded done Act gets another", rather
 * than burying the policy in a ternary inside JSX. */
const SCROLLABLE_BODY = 'mt-4 overflow-y-auto pr-1 act-scroll';
const ACTIVE_BODY = `${SCROLLABLE_BODY} max-h-[clamp(280px,42vh,520px)] min-h-[160px]`;
const EXPANDED_BODY = `${SCROLLABLE_BODY} animate-fade-in max-h-[clamp(320px,58vh,640px)]`;

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
        <div className={state === 'active' ? ACTIVE_BODY : EXPANDED_BODY}>
          {children}
        </div>
      )}
    </section>
  );
}
