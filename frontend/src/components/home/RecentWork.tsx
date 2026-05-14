'use client';

/**
 * RecentWork — cross-module activity feed.
 *
 * A 5-row timeline that merges activity from all three READY modules,
 * sorted by the most recent update. Each row reads as a single
 * editorial sentence:
 *
 *   2h ago   ◆   fog navigation under low visibility    ↗
 *
 * Columns (CSS grid on .timeline-row):
 *   - 6.5rem · relative timestamp in mono
 *   - 1.5rem · module icon in a tiny rounded square
 *   - 1fr    · title (truncates)
 *   - auto   · "open" arrow that fades in on hover
 *
 * Click → routes to the module's home (deep linking to a specific
 * session is a v2 thing; the module's own history drawer takes
 * over from there).
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Code, Lightbulb, PenTool } from 'lucide-react';
import {
  codelabSessionApi,
  sessionApi,
  writerApi,
} from '@/lib/api-client';
import { relativeTime } from '@/lib/format';

interface TimelineRow {
  id: string;
  moduleId: 'ideaspark' | 'writer' | 'codelab';
  title: string;
  updatedMs: number;
}

const MODULE_ICON = {
  ideaspark: Lightbulb,
  writer: PenTool,
  codelab: Code,
} as const;

const MODULE_LABEL = {
  ideaspark: 'IdeaSpark',
  writer: 'WriterAI',
  codelab: 'CodeLab',
} as const;

export function RecentWork() {
  const [rows, setRows] = useState<TimelineRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const collected: TimelineRow[] = [];

    const merge = () => {
      if (cancelled) return;
      const sorted = [...collected].sort((a, b) => b.updatedMs - a.updatedMs).slice(0, 5);
      setRows(sorted);
    };

    const promises: Promise<void>[] = [];

    // IdeaSpark
    promises.push(
      sessionApi
        .list(20, 'ideaspark')
        .then((raw) => {
          if (cancelled || !Array.isArray(raw)) return;
          const list = raw as Array<{
            session_id: string;
            title?: string;
            updated_at?: string | null;
            created_at?: string | null;
          }>;
          for (const s of list) {
            const ms = new Date(s.updated_at ?? s.created_at ?? 0).getTime();
            if (!Number.isFinite(ms) || ms === 0) continue;
            collected.push({
              id: `is-${s.session_id}`,
              moduleId: 'ideaspark',
              title: s.title ?? '未命名辩论',
              updatedMs: ms,
            });
          }
          merge();
        })
        .catch(() => {}),
    );

    // Writer documents
    promises.push(
      writerApi
        .listDocuments()
        .then((list) => {
          if (cancelled) return;
          for (const d of list) {
            const ms = new Date(d.updated_at).getTime();
            if (!Number.isFinite(ms) || ms === 0) continue;
            collected.push({
              id: `wr-${d.doc_id}`,
              moduleId: 'writer',
              title: d.title || '未命名文档',
              updatedMs: ms,
            });
          }
          merge();
        })
        .catch(() => {}),
    );

    // CodeLab sessions
    promises.push(
      codelabSessionApi
        .list()
        .then((list) => {
          if (cancelled) return;
          for (const s of list) {
            const ms = s.updatedAt ?? 0;
            if (!Number.isFinite(ms) || ms === 0) continue;
            collected.push({
              id: `cl-${s.id}`,
              moduleId: 'codelab',
              title: s.title || '未命名会话',
              updatedMs: ms,
            });
          }
          merge();
        })
        .catch(() => {}),
    );

    Promise.allSettled(promises).then(() => {
      if (!cancelled) setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-14 animate-fade-in-up" style={{ animationDelay: '420ms' }}>
      <div className="flex items-center gap-3 mb-4">
        <span className="atelier-eyebrow">Recent work</span>
        <span
          className="h-px flex-1 bg-gradient-to-r from-border/60 via-border/40 to-transparent"
          aria-hidden
        />
        {loaded && rows.length > 0 && (
          <span
            className="text-[9.5px] uppercase tracking-[0.22em] text-muted-foreground/45 tabular-nums"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {rows.length}/5
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        {!loaded && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="timeline-row opacity-30"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span
                  className="text-[10px] text-muted-foreground/30"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  载入中…
                </span>
                <span className="h-5 w-5 rounded-md bg-foreground/[0.05]" />
                <span className="h-3 w-32 rounded-sm bg-foreground/[0.05]" />
                <span />
              </div>
            ))}
          </>
        )}

        {loaded && rows.length === 0 && (
          <div className="py-8 text-center">
            <p
              className="text-[14px] text-muted-foreground/55 tracking-wide"
            >
              尚无活动 —— 打开任一模块开始。
            </p>
          </div>
        )}

        {rows.map((row) => {
          const Icon = MODULE_ICON[row.moduleId];
          return (
            <Link
              key={row.id}
              href={`/modules/${row.moduleId}`}
              className="timeline-row group"
            >
              <span
                className="text-[11px] tabular-nums text-muted-foreground/55"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {relativeTime(row.updatedMs)}
              </span>

              <span
                className="flex h-5 w-5 items-center justify-center rounded-md bg-warm/8 text-warm/85 transition-colors group-hover:bg-warm/15 group-hover:text-warm"
                title={MODULE_LABEL[row.moduleId]}
              >
                <Icon className="h-3 w-3" strokeWidth={2.1} />
              </span>

              <span
                className="text-[13px] tracking-tight text-foreground/80 truncate group-hover:text-foreground/95"
                title={row.title}
              >
                {row.title}
              </span>

              <ArrowUpRight
                className="h-3 w-3 text-muted-foreground/30 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:text-warm group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={2.4}
                aria-hidden
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
