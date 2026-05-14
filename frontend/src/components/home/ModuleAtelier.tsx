'use client';

/**
 * ModuleAtelier — the three READY modules, unequal in weight.
 *
 * The most-recently active module is promoted to HERO (rounded-2xl,
 * function-forward signature in DM Serif Display, big mono counter,
 * cinematic photo backdrop, soft warm glow). The other two ride along
 * as SECONDARY chips with photo-thumbnail icons. A planned row sits
 * below them as a quiet horizontal line of locked future modules.
 *
 * Data feed runs in parallel on mount:
 *   - IdeaSpark    → /api/sessions?module_id=ideaspark
 *   - WriterAI     → /api/writer/documents
 *   - CodeLab      → /api/codelab/sessions
 *
 * If everything fails the page still shows IdeaSpark as hero with
 * "0 场辩论 · 暂无活动" — never a blank space.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Code,
  Lightbulb,
  Lock,
  PenTool,
  Search,
} from 'lucide-react';
import {
  codelabSessionApi,
  sessionApi,
  writerApi,
} from '@/lib/api-client';
import { MODULE_NOUN_EN, MODULE_NOUN_ZH, relativeTime } from '@/lib/format';

/* ──────────────────────────────────────────────────────────────
 *  Static metadata for the three READY modules.
 *
 *  Signature lines are intentionally short, lowercase-leaning,
 *  serif-feeling. They are the one thing the user reads in the
 *  hero card under the module name.
 * ────────────────────────────────────────────────────────────── */

interface RoomMeta {
  id: 'ideaspark' | 'codelab' | 'writer';
  name: string;
  icon: typeof Lightbulb;
  signature: string;
  photo: string;
}

/* Signature lines are intentionally function-forward: each one is a
   one-line description of what the module DOES, not a poetic slogan.
   SoloLab is a research lab tool, so the home page reads like a lab
   manifest rather than a Kinfolk magazine spread. The data row
   underneath uses Chinese units via MODULE_NOUN_ZH.

   Each module has its own atmosphere photograph in /public/atelier/.
   The hero card uses it as a cinematic backdrop; secondary chips use
   it as a 44×44 rounded thumbnail that replaces the icon tile. */
const ROOMS: RoomMeta[] = [
  {
    id: 'ideaspark',
    name: 'IdeaSpark',
    icon: Lightbulb,
    signature: 'Multi-agent hypothesis generation.',
    photo: '/atelier/room-ideaspark.png',
  },
  {
    id: 'writer',
    name: 'WriterAI',
    icon: PenTool,
    signature: 'Academic manuscript drafting.',
    photo: '/atelier/room-writer.png',
  },
  {
    id: 'codelab',
    name: 'CodeLab',
    icon: Code,
    signature: 'AI-assisted experiment scaffolding.',
    photo: '/atelier/room-codelab.png',
  },
];

/* Planned ("Coming soon") metadata — used by the bottom row. */

interface SoonMeta {
  id: string;
  name: string;
  icon: typeof Lightbulb;
}

const SOON: SoonMeta[] = [
  { id: 'datalens', name: 'DataLens', icon: BarChart3 },
  { id: 'litreview', name: 'LitReview', icon: BookOpen },
  { id: 'reviewer', name: 'Reviewer', icon: Search },
];

/* ──────────────────────────────────────────────────────────────
 *  Stats shape — normalized across the three data sources.
 * ────────────────────────────────────────────────────────────── */

interface RoomStats {
  count: number;
  lastTitle: string | null;
  lastUpdatedMs: number;
  loaded: boolean;
}

const EMPTY: RoomStats = { count: 0, lastTitle: null, lastUpdatedMs: 0, loaded: false };

/* ──────────────────────────────────────────────────────────────
 *  Component
 * ────────────────────────────────────────────────────────────── */

export function ModuleAtelier() {
  const [stats, setStats] = useState<Record<RoomMeta['id'], RoomStats>>({
    ideaspark: EMPTY,
    writer: EMPTY,
    codelab: EMPTY,
  });

  useEffect(() => {
    let cancelled = false;

    const update = (id: RoomMeta['id'], next: RoomStats) => {
      if (cancelled) return;
      setStats((prev) => ({ ...prev, [id]: next }));
    };

    // IdeaSpark sessions
    sessionApi
      .list(50, 'ideaspark')
      .then((raw) => {
        const list = Array.isArray(raw) ? (raw as Array<{ title?: string; updated_at?: string | null; created_at?: string | null }>) : [];
        const sorted = [...list].sort((a, b) => {
          const ta = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
          const tb = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
          return tb - ta;
        });
        const first = sorted[0];
        update('ideaspark', {
          count: list.length,
          lastTitle: first?.title ?? null,
          lastUpdatedMs: first ? new Date(first.updated_at ?? first.created_at ?? 0).getTime() : 0,
          loaded: true,
        });
      })
      .catch(() => update('ideaspark', { ...EMPTY, loaded: true }));

    // Writer documents
    writerApi
      .listDocuments()
      .then((list) => {
        const sorted = [...list].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
        const first = sorted[0];
        update('writer', {
          count: list.length,
          lastTitle: first?.title ?? null,
          lastUpdatedMs: first ? new Date(first.updated_at).getTime() : 0,
          loaded: true,
        });
      })
      .catch(() => update('writer', { ...EMPTY, loaded: true }));

    // CodeLab sessions
    codelabSessionApi
      .list()
      .then((list) => {
        const sorted = [...list].sort(
          (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
        );
        const first = sorted[0];
        update('codelab', {
          count: list.length,
          lastTitle: first?.title ?? null,
          lastUpdatedMs: first ? first.updatedAt ?? 0 : 0,
          loaded: true,
        });
      })
      .catch(() => update('codelab', { ...EMPTY, loaded: true }));

    return () => {
      cancelled = true;
    };
  }, []);

  /* Hero pick — most recently active, IdeaSpark as fallback. */
  const heroId = useMemo<RoomMeta['id']>(() => {
    const candidates = ROOMS.map((r) => ({ id: r.id, ms: stats[r.id].lastUpdatedMs }));
    const withActivity = candidates.filter((c) => c.ms > 0);
    if (withActivity.length === 0) return 'ideaspark';
    withActivity.sort((a, b) => b.ms - a.ms);
    return withActivity[0].id;
  }, [stats]);

  const heroMeta = ROOMS.find((r) => r.id === heroId)!;
  const heroStats = stats[heroId];
  const secondary = ROOMS.filter((r) => r.id !== heroId);

  return (
    <section className="relative">
      {/* Section eyebrow — modules, not rooms */}
      <div className="flex items-center gap-3 mb-6 animate-fade-in-up" style={{ animationDelay: '220ms' }}>
        <span className="atelier-eyebrow">Modules</span>
        <span className="h-px flex-1 bg-gradient-to-r from-border/60 via-border/40 to-transparent" aria-hidden />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5 animate-fade-in-up" style={{ animationDelay: '260ms' }}>
        {/* HERO ROOM — 3/5 width */}
        <div className="md:col-span-3">
          <HeroRoom meta={heroMeta} stats={heroStats} />
        </div>

        {/* SECONDARY ROOMS — 2/5 width, stacked */}
        <div className="md:col-span-2 flex flex-col gap-4">
          {secondary.map((m) => (
            <SecondaryRoom key={m.id} meta={m} stats={stats[m.id]} />
          ))}
        </div>
      </div>

      {/* COMING SOON row — eyebrow stays English (decoration layer), the
          tooltip is Chinese (action / status layer). */}
      <div className="mt-10 animate-fade-in-up" style={{ animationDelay: '340ms' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="atelier-eyebrow" style={{ color: 'color-mix(in oklab, var(--color-muted-foreground) 60%, transparent)' }}>
            Coming soon
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-border/40 to-transparent" aria-hidden />
        </div>
        <div className="flex flex-wrap gap-2.5">
          {SOON.map((m) => {
            const Icon = m.icon;
            return (
              <span
                key={m.id}
                className="inline-flex items-center gap-2 rounded-full bg-foreground/[0.025] px-3.5 py-1.5 text-[11.5px] tracking-tight text-foreground/40"
                title={`${m.name} · 即将上线`}
              >
                <Icon className="h-3 w-3" strokeWidth={1.9} />
                {m.name}
                <Lock className="h-2.5 w-2.5 opacity-60" />
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
 *  HeroRoom — the big one. 3/5 width on desktop.
 * ────────────────────────────────────────────────────────────── */

function HeroRoom({ meta, stats }: { meta: RoomMeta; stats: RoomStats }) {
  const Icon = meta.icon;
  const isActive = stats.count > 0;

  return (
    <Link
      href={`/modules/${meta.id}`}
      className="atelier-glow group relative block h-full overflow-hidden rounded-2xl bg-card/55 backdrop-blur-sm transition-all duration-300 hover:bg-card/72 hover:shadow-[0_24px_60px_-22px_rgba(184,149,106,0.30)] dark:hover:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)]"
    >
      {/* Atmosphere photograph — cinematic backdrop anchored bottom-right.
          Fades diagonally up-left via .room-photo-fade so the typography
          column on the left stays readable on any photo. */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="relative h-full w-full room-photo-fade">
          <Image
            src={meta.photo}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 540px"
            className="object-cover object-bottom opacity-60 transition-opacity duration-500 group-hover:opacity-80 dark:opacity-35 dark:group-hover:opacity-55"
          />
        </div>
      </div>

      {/* Inner padding — generous so the typography breathes */}
      <div className="relative z-10 px-7 pt-6 pb-7">
        {/* Eyebrow + icon */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="atelier-eyebrow">
              {meta.name}
            </span>
            <span className="h-px w-6 bg-warm/35" aria-hidden />
            <span className="text-[9.5px] uppercase tracking-[0.28em] text-muted-foreground/55">
              {isActive ? 'last active' : 'new'}
            </span>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warm/12 text-warm transition-colors group-hover:bg-warm/18">
            <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
          </div>
        </div>

        {/* Module name + signature line */}
        <h2
          className="mt-3 text-[30px] leading-[1.1] tracking-tight text-foreground/95"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {meta.name}
        </h2>
        <p
          className="mt-1 text-[15px] italic text-foreground/55"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {meta.signature}
        </p>

        {/* Soft seam */}
        <hr className="soft-divider my-6" />

        {/* Data row — big count uses English unit eyebrow (decoration);
            last-activity row uses Chinese title + Chinese relative time. */}
        <div className="flex items-end gap-7">
          <div>
            <div className="flex items-baseline gap-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
              <span className={`text-[34px] font-medium tabular-nums leading-none tracking-tight ${
                stats.loaded ? 'text-foreground/95' : 'text-foreground/25'
              }`}>
                {stats.loaded ? stats.count : '—'}
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/55">
                {MODULE_NOUN_EN[meta.id]}
              </span>
            </div>
          </div>

          {isActive && (
            <div className="flex-1 min-w-0">
              <span className="atelier-eyebrow block mb-1" style={{ color: 'color-mix(in oklab, var(--color-muted-foreground) 70%, transparent)' }}>
                Last
              </span>
              <p className="text-[12.5px] text-foreground/70 truncate" title={stats.lastTitle ?? ''}>
                {stats.lastTitle ?? '未命名'}
              </p>
              <p
                className="mt-0.5 text-[10.5px] tabular-nums text-muted-foreground/55"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {relativeTime(stats.lastUpdatedMs)}
              </p>
            </div>
          )}
        </div>

        {/* CTA — direct verbs, no "推门" lifestyle flourish */}
        <div className="mt-7 inline-flex items-center gap-1.5">
          <span className="text-[12px] font-medium tracking-wide text-warm">
            {isActive ? '继续' : '进入模块'}
          </span>
          <ArrowUpRight
            className="h-3.5 w-3.5 text-warm transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.2}
          />
        </div>
      </div>

    </Link>
  );
}

/* ──────────────────────────────────────────────────────────────
 *  SecondaryRoom — chip. 2/5 width on desktop, stacked.
 * ────────────────────────────────────────────────────────────── */

function SecondaryRoom({ meta, stats }: { meta: RoomMeta; stats: RoomStats }) {
  const isActive = stats.count > 0;

  return (
    <Link
      href={`/modules/${meta.id}`}
      className="module-chip group relative flex flex-1 items-start gap-3.5 rounded-xl bg-card/40 backdrop-blur-[2px] px-4 py-4 transition-all"
    >
      {/* Photo thumbnail — replaces the icon tile. The photo's mood
          already evokes the module identity, so a separate icon would
          be redundant noise. Ring keeps the edge from feeling hard. */}
      <div
        className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg transition-transform duration-300 group-hover:scale-[1.04]"
        style={{
          boxShadow:
            'inset 0 0 0 1px color-mix(in oklab, var(--color-warm) 22%, transparent), 0 4px 12px -6px rgba(184, 149, 106, 0.25)',
        }}
      >
        <Image
          src={meta.photo}
          alt=""
          fill
          sizes="44px"
          className="object-cover"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="text-[15px] font-medium tracking-tight text-foreground/90"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {meta.name}
          </span>
          <ArrowUpRight
            className="h-3 w-3 shrink-0 text-muted-foreground/40 transition-all duration-300 group-hover:text-warm group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.4}
          />
        </div>

        <p
          className="mt-0.5 text-[11px] italic text-muted-foreground/65 truncate"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {meta.signature}
        </p>

        <div className="mt-2.5 flex items-baseline gap-1.5 flex-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
          <span className={`text-[15px] font-medium tabular-nums leading-none ${
            stats.loaded ? 'text-foreground/85' : 'text-foreground/25'
          }`}>
            {stats.loaded ? stats.count : '—'}
          </span>
          <span className="text-[10px] tracking-tight text-muted-foreground/65" style={{ fontFamily: 'var(--font-sans)' }}>
            {MODULE_NOUN_ZH[meta.id]}
          </span>
          {isActive ? (
            <>
              <span className="mx-1 text-muted-foreground/30">·</span>
              <span className="text-[10px] tabular-nums text-muted-foreground/55" style={{ fontFamily: 'var(--font-sans)' }}>
                {relativeTime(stats.lastUpdatedMs)}
              </span>
            </>
          ) : stats.loaded ? (
            <span className="ml-1 text-[10px] text-muted-foreground/45" style={{ fontFamily: 'var(--font-sans)' }}>
              · 暂无活动
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
