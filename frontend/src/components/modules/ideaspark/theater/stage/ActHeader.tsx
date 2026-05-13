'use client';

/**
 * ActHeader — the eyebrow that introduces each Act on the main stage.
 * The leading rule is short and fading; no full-width divider line. The
 * roman numeral sits inline, in the display serif, as a quiet ornament.
 */

import { CheckCircle2, Loader2 } from 'lucide-react';
import { PHASE_META, phaseRoman, type PhaseId } from '../../shared/PersonaMeta';

export type ActState = 'pending' | 'active' | 'done';

interface ActHeaderProps {
  phase: PhaseId;
  state: ActState;
  meta?: React.ReactNode;
}

export function ActHeader({ phase, state, meta }: ActHeaderProps) {
  const m = PHASE_META[phase];
  const roman = phaseRoman(phase);

  return (
    <header className="flex items-baseline gap-3">
      <span className="eyebrow-rule shrink-0 mt-2" aria-hidden />
      <div className="flex items-baseline gap-3 min-w-0">
        <span
          className={`text-[20px] leading-none tabular-nums ${
            state === 'active' ? 'text-warm/80' : 'text-muted-foreground/40'
          }`}
          style={{ fontFamily: 'var(--font-display)' }}
          aria-hidden
        >
          {roman}
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/55">
            {m?.caps.replace(/^ACT [IVX]+ · /, '') ?? phase}
          </span>
          <span className="text-[13px] text-foreground/80 tracking-tight mt-0.5">
            {m?.subtitle ?? ''}
          </span>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2 text-[10.5px] text-muted-foreground/55 tabular-nums">
        {state === 'active' && (
          <span className="inline-flex items-center gap-1.5 text-warm/75">
            <Loader2 className="h-3 w-3 animate-spin" /> 进行中
          </span>
        )}
        {state === 'done' && (
          <span className="inline-flex items-center gap-1.5 text-foreground/55">
            <CheckCircle2 className="h-3 w-3 text-warm/55" /> 已完成
          </span>
        )}
        {meta}
      </div>
    </header>
  );
}
