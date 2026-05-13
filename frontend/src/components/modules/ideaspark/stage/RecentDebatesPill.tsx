'use client';

/**
 * RecentDebatesPill — a quiet floating affordance that surfaces past
 * debates without competing with the hero. Click reveals a soft drop
 * panel listing the N most recent sessions.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, History } from 'lucide-react';
import { useSessionStore, type SessionInfo } from '@/stores/session-store';

interface RecentDebatesPillProps {
  moduleId: string;
}

export function RecentDebatesPill({ moduleId }: RecentDebatesPillProps) {
  const [open, setOpen] = useState(false);
  const sessions = useSessionStore((s) => s.sessions);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const loadHistory = useSessionStore((s) => s.loadHistory);
  const ref = useRef<HTMLDivElement>(null);

  // Defer the sessions fetch until the entry animation has settled —
  // otherwise the store update during the first ~300ms triggers a
  // composite-pass right when the warm orb is being rasterized.
  useEffect(() => {
    const t = setTimeout(() => void fetchSessions(moduleId), 220);
    return () => clearTimeout(t);
  }, [moduleId, fetchSessions]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const moduleSessions = sessions.filter((s) => s.module_id === moduleId).slice(0, 6);
  if (moduleSessions.length === 0) return null;

  return (
    <div ref={ref} className="absolute bottom-6 right-6 z-20">
      {open && <SessionsPanel sessions={moduleSessions} onPick={(s) => { void loadHistory(s.session_id); setOpen(false); }} />}
      <button
        onClick={() => setOpen((v) => !v)}
        className="group/pill flex items-center gap-2 rounded-full bg-card/90 backdrop-blur-sm pl-3 pr-2.5 py-1.5 text-[11px] text-muted-foreground/70 transition-all hover:bg-card hover:text-foreground hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] animate-fade-in-up"
        style={{ animationDelay: '450ms' }}
      >
        <History className="h-3 w-3 text-warm/65" />
        <span className="tracking-wide">最近</span>
        <span className="tabular-nums text-foreground/85 font-medium">{moduleSessions.length}</span>
        <span className="text-muted-foreground/45">场辩论</span>
        <ChevronRight className={`h-3 w-3 text-muted-foreground/45 transition-transform duration-200 ${open ? '-rotate-90' : ''}`} />
      </button>
    </div>
  );
}

function SessionsPanel({
  sessions,
  onPick,
}: {
  sessions: SessionInfo[];
  onPick: (s: SessionInfo) => void;
}) {
  return (
    <div
      className="absolute bottom-[calc(100%+8px)] right-0 w-[300px] rounded-xl bg-card shadow-[0_18px_50px_-18px_rgba(0,0,0,0.25)] animate-fade-in-up py-2 px-1"
      style={{ animationDuration: '180ms' }}
    >
      <p className="px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/55">
        Past debates
      </p>
      <div className="mt-1 max-h-[280px] overflow-y-auto">
        {sessions.map((s) => (
          <button
            key={s.session_id}
            onClick={() => onPick(s)}
            className="group/item w-full text-left rounded-lg px-3 py-2 hover:bg-foreground/[0.04] transition-colors"
          >
            <p className="text-[12px] text-foreground/85 truncate group-hover/item:text-foreground transition-colors">
              {s.title || '未命名辩论'}
            </p>
            {s.updated_at && (
              <p className="mt-0.5 text-[10px] text-muted-foreground/45 tabular-nums">
                {new Date(s.updated_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
