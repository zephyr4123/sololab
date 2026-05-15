'use client';

/**
 * HeroBanner — the lab's status header.
 *
 * Composition:
 *   - Left column: eyebrow + declarative H1 + live data sub-line
 *   - Right column: research-workstation photograph with radial-mask
 *     fade into the page (typography stays readable over any photo)
 *
 * The sub-line pulls the single most-recent activity across all three
 * READY modules (IdeaSpark sessions, Writer documents, CodeLab
 * sessions) and renders it as one terse status string. When nothing
 * has been touched it falls back to a quiet "Idle" prompt.
 *
 * Tone is "lab dashboard", not "atelier magazine" — no rooms metaphor,
 * no seasonal flourish, no italic name accent. The H1 is a status
 * statement ("Day 44 in the lab."), the sub-line is data.
 */

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  codelabSessionApi,
  sessionApi,
  writerApi,
} from '@/lib/api-client';
import { relativeTime } from '@/lib/format';

/* Anchor date for the "Day N" counter. Choose any conceptual lab-opening
 * day; the counter increments by 1 each calendar day after this. */
const LAB_OPENED = new Date('2026-04-01T00:00:00');

function dayInLab(): number {
  const diff = Date.now() - LAB_OPENED.getTime();
  return Math.max(1, Math.floor(diff / 86_400_000) + 1);
}

interface LatestActivity {
  module: 'IdeaSpark' | 'Writer' | 'CodeLab';
  title: string;
  updatedMs: number;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export function HeroBanner() {
  const day = dayInLab();
  const [latest, setLatest] = useState<LatestActivity | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const collected: LatestActivity[] = [];

    const tryAdd = (entry: LatestActivity | null) => {
      if (entry && Number.isFinite(entry.updatedMs) && entry.updatedMs > 0) {
        collected.push(entry);
      }
    };

    const promises: Promise<void>[] = [
      sessionApi
        .list(1, 'ideaspark')
        .then((raw) => {
          if (cancelled || !Array.isArray(raw)) return;
          const s = raw[0] as
            | { title?: string; updated_at?: string | null; created_at?: string | null }
            | undefined;
          if (!s) return;
          tryAdd({
            module: 'IdeaSpark',
            title: s.title || '未命名会话',
            updatedMs: new Date(s.updated_at ?? s.created_at ?? 0).getTime(),
          });
        })
        .catch(() => {}),

      writerApi
        .listDocuments()
        .then((list) => {
          if (cancelled) return;
          const sorted = [...list].sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
          );
          const d = sorted[0];
          if (!d) return;
          tryAdd({
            module: 'Writer',
            title: d.title || '未命名文档',
            updatedMs: new Date(d.updated_at).getTime(),
          });
        })
        .catch(() => {}),

      codelabSessionApi
        .list()
        .then((list) => {
          if (cancelled) return;
          const sorted = [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
          const s = sorted[0];
          if (!s) return;
          tryAdd({
            module: 'CodeLab',
            title: s.title || '未命名会话',
            updatedMs: s.updatedAt ?? 0,
          });
        })
        .catch(() => {}),
    ];

    Promise.allSettled(promises).then(() => {
      if (cancelled) return;
      collected.sort((a, b) => b.updatedMs - a.updatedMs);
      setLatest(collected[0] ?? null);
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="relative pt-14 pb-10 min-h-[360px]">
      {/* Warm orb pinned to the typography side keeps the left column
          from going cold against the photograph on the right. */}
      <div
        className="warm-orb"
        style={{ top: '-40px', left: '-80px', width: 420, height: 420 }}
        aria-hidden
      />

      {/* Research-workstation photograph — radial-masked, anchored right */}
      <div
        className="pointer-events-none absolute inset-y-0 right-[-32px] w-[58%] max-w-[640px] min-w-[320px] animate-fade-in"
        style={{ animationDelay: '40ms', animationDuration: '900ms' }}
        aria-hidden
      >
        <div className="relative h-full w-full hero-image-fade">
          <Image
            src="/atelier/hero-morning.png"
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 80vw, 640px"
            className="object-cover object-center opacity-95 dark:opacity-70"
          />
        </div>
      </div>

      <div className="relative animate-fade-in-up max-w-[560px]">
        {/* Eyebrow — terse, lab-status feel. Two atoms only:
            brand wordmark + day counter. No season, no flourish. */}
        <div
          className="flex items-center gap-3 mb-7"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <span className="atelier-eyebrow" style={{ letterSpacing: '0.32em' }}>
            SoloLab
          </span>
          <span className="h-px w-6 bg-warm/35" aria-hidden />
          <span className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground/55 tabular-nums">
            Day {day}
          </span>
        </div>

        {/* H1 — declarative lab status, not greeting */}
        <h1
          className="leading-[1.05] tracking-tight text-foreground/95 animate-fade-in-up"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(36px, 4.8vw, 58px)',
            animationDelay: '80ms',
          }}
        >
          Day {day} in the lab.
        </h1>

        {/* Data sub-line — pulls the latest activity across modules.
            Tabular-nums + monospace stays calm under data churn. */}
        <p
          className="mt-5 max-w-[480px] text-[13px] leading-relaxed text-muted-foreground/65 animate-fade-in-up tabular-nums"
          style={{ fontFamily: 'var(--font-mono)', animationDelay: '160ms' }}
        >
          {!loaded ? (
            <span className="text-muted-foreground/35">—</span>
          ) : latest ? (
            <>
              Last active {relativeTime(latest.updatedMs, { english: true })} ·{' '}
              <span className="text-warm/85">{latest.module}</span> ·{' '}
              <span className="text-foreground/80">"{truncate(latest.title, 42)}"</span>
            </>
          ) : (
            <>Idle. Open a module to begin.</>
          )}
        </p>
      </div>
    </section>
  );
}
