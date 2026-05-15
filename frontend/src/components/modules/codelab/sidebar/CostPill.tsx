'use client';

/**
 * CostPill — footer cost indicator.
 *
 * One row: eyebrow + tabular mono number. Hidden when costUsd is 0
 * so the sidebar doesn't carry a "$0.0000" placeholder.
 *
 * Why this is its own component: the cost number is the only piece of
 * "module health" telemetry surfaced in the sidebar, so it gets a
 * deliberate visual home rather than being tacked onto the bottom of
 * SessionList. Future telemetry (token count, model name) slots in
 * here without disturbing the rest of the sidebar.
 */

interface CostPillProps {
  costUsd: number;
}

export function CostPill({ costUsd }: CostPillProps) {
  if (costUsd <= 0) return null;

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between">
        <span className="atelier-eyebrow">spend</span>
        <span
          className="tabular-nums text-[11px] text-foreground/75"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          ${costUsd.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
