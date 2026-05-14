'use client';

/**
 * TodayWidget — sidebar's bottom data card.
 *
 * Shows today's LLM activity in JetBrains Mono. Three rows:
 *   - Eyebrow "Today" + tiny call counter on the right
 *   - Large mono dollar figure as the centerpiece
 *   - Budget hint with percentage progress
 *
 * Data source: `/api/providers/cost?days=1`. The endpoint may return
 * various shapes (we've seen `{total_cost, call_count}` and `{total: ..., count: ...}`),
 * so we normalize defensively. On failure we degrade to "—" placeholders.
 */

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { costApi } from '@/lib/api-client';

const BUDGET_USD = 50;

interface CostStats {
  cost: number;
  calls: number;
}

function normalize(raw: unknown): CostStats {
  if (!raw || typeof raw !== 'object') return { cost: 0, calls: 0 };
  const r = raw as Record<string, unknown>;
  // The endpoint returns either {total_cost, call_count} or {total, count}.
  const cost =
    typeof r.total_cost === 'number'
      ? r.total_cost
      : typeof r.total === 'number'
        ? r.total
        : typeof r.cost === 'number'
          ? r.cost
          : 0;
  const calls =
    typeof r.call_count === 'number'
      ? r.call_count
      : typeof r.count === 'number'
        ? r.count
        : typeof r.calls === 'number'
          ? r.calls
          : 0;
  return { cost, calls };
}

export function TodayWidget() {
  const [stats, setStats] = useState<CostStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    costApi
      .getTotal(1)
      .then((raw) => {
        if (cancelled) return;
        setStats(normalize(raw));
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cost = stats?.cost ?? 0;
  const calls = stats?.calls ?? 0;
  const pct = Math.min(100, Math.round((cost / BUDGET_USD) * 1000) / 10);
  const isLoaded = stats !== null && !error;

  return (
    <div
      className="relative overflow-hidden rounded-xl px-3 py-2.5"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in oklab, var(--color-warm) 5%, transparent) 0%, transparent 100%)',
        boxShadow:
          'inset 0 0 0 1px color-mix(in oklab, var(--color-warm) 8%, transparent)',
      }}
    >
      {/* Top row: eyebrow + calls */}
      <div className="flex items-center justify-between">
        <span className="atelier-eyebrow" style={{ letterSpacing: '0.24em' }}>
          Today
        </span>
        <span
          className="inline-flex items-center gap-1 text-[10.5px] tabular-nums text-muted-foreground/70"
          style={{ fontFamily: 'var(--font-mono)' }}
          title={`今日已调用 ${calls} 次`}
        >
          <Zap className="h-2.5 w-2.5 text-warm/70" strokeWidth={2.4} />
          {isLoaded ? calls : '—'}
        </span>
      </div>

      {/* Centerpiece: dollar figure */}
      <div
        className="mt-1.5 flex items-baseline gap-0.5"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <span className="text-[10.5px] font-medium text-foreground/55">$</span>
        <span
          className={`text-[20px] font-medium tabular-nums leading-none tracking-tight ${
            isLoaded ? 'text-foreground/95' : 'text-foreground/30'
          }`}
        >
          {isLoaded ? cost.toFixed(2) : '0.00'}
        </span>
      </div>

      {/* Budget hint */}
      <div className="mt-1.5">
        <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-foreground/[0.05]">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-warm/60 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span
            className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/55"
          >
            ${BUDGET_USD} budget
          </span>
          <span
            className="text-[9px] tabular-nums text-muted-foreground/55"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}
