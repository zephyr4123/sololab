'use client';

/**
 * ThinkingIndicator — a single line of "agent is reasoning" feedback.
 *
 * The verb cycles per render (chosen once, sticky for the lifecycle).
 * Bouncing dots use the global `.thinking-dot` keyframe so timing is
 * consistent with other modules. No background, no border — this is
 * a text artefact, not a UI panel.
 */

import { useState } from 'react';

const VERBS = [
  '思考中', '推理中', '酝酿中', '梳理中',
  '编织中', '连接中', '提炼中', '设计中',
];

export function ThinkingIndicator() {
  const [verb] = useState(() => VERBS[Math.floor(Math.random() * VERBS.length)]);

  return (
    <div className="flex items-center gap-1.5 py-1.5 select-none animate-fade-in">
      <span
        className="text-[12.5px] italic tracking-wide text-muted-foreground/45"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {verb}
      </span>
      <span className="flex items-center gap-[3px]">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="thinking-dot h-[5px] w-[5px] rounded-full"
            style={{
              animationDelay: `${delay}ms`,
              backgroundColor: 'var(--color-warm)',
              opacity: 0.55,
            }}
          />
        ))}
      </span>
    </div>
  );
}
