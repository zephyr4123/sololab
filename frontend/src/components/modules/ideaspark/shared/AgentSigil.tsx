'use client';

/**
 * AgentSigil — the persona's calling card.
 *
 * Renders monogram glyph in display serif + caps name in mono. No color
 * coding — the whole module uses greyscale + warm accent. State (idle /
 * thinking / done) is conveyed through opacity + a single warm dot, not
 * a coloured border.
 */

import { getPersona, type PersonaId } from './PersonaMeta';

export type SigilState = 'idle' | 'thinking' | 'streaming' | 'done';

interface AgentSigilProps {
  agent: PersonaId | string;
  state?: SigilState;
  size?: 'sm' | 'md';
  showZh?: boolean;
  className?: string;
}

export function AgentSigil({
  agent,
  state = 'idle',
  size = 'md',
  showZh = true,
  className = '',
}: AgentSigilProps) {
  const persona = getPersona(agent);
  const monogram = persona?.monogram ?? '·';
  const caps = persona?.caps ?? (agent || '').toUpperCase();
  const zh = persona?.zh ?? agent;

  const mono = size === 'sm' ? 'text-[16px]' : 'text-[19px]';
  const capsCls = size === 'sm' ? 'text-[9.5px]' : 'text-[10px]';
  const zhCls = size === 'sm' ? 'text-[11px]' : 'text-[12px]';

  return (
    <div className={`inline-flex items-baseline gap-2.5 ${className}`}>
      <span
        className={`${mono} leading-none text-foreground/80 transition-opacity ${
          state === 'idle' ? 'opacity-40' : 'opacity-90'
        }`}
        style={{ fontFamily: 'var(--font-display)' }}
        aria-hidden
      >
        {monogram}
      </span>
      <span className="flex flex-col leading-tight">
        <span
          className={`${capsCls} tracking-[0.22em] uppercase text-muted-foreground/55 font-medium`}
        >
          {caps}
        </span>
        {showZh && (
          <span
            className={`${zhCls} text-foreground/75 tracking-tight`}
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {zh}
          </span>
        )}
      </span>
      {state === 'thinking' && (
        <span className="ml-0.5 flex h-1.5 items-center gap-[3px]">
          <span className="h-1 w-1 rounded-full bg-warm/65 animate-pulse" />
          <span className="h-1 w-1 rounded-full bg-warm/65 animate-pulse" style={{ animationDelay: '120ms' }} />
          <span className="h-1 w-1 rounded-full bg-warm/65 animate-pulse" style={{ animationDelay: '240ms' }} />
        </span>
      )}
      {state === 'streaming' && (
        <span className="relative ml-0.5 inline-flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-warm/60 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warm" />
        </span>
      )}
    </div>
  );
}
