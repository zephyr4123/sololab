'use client';

/**
 * CurtainActions — three quiet actions at the curtain's foot:
 *   - Export markdown report
 *   - Continue with a new round (focuses composer in the Theater chat)
 *   - View full process recap (toggles ProcessRecap below)
 */

import { ArrowRight, Download, History } from 'lucide-react';

interface CurtainActionsProps {
  onExport: () => void;
  onNewRound: () => void;
  onToggleRecap: () => void;
  recapOpen: boolean;
}

export function CurtainActions({ onExport, onNewRound, onToggleRecap, recapOpen }: CurtainActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      <button
        onClick={onNewRound}
        className="group inline-flex items-center gap-2 rounded-full bg-warm px-5 py-2 text-[12.5px] font-medium text-warm-foreground transition-all hover:opacity-95 shadow-[0_6px_20px_-8px_rgba(184,149,106,0.45)]"
      >
        再开一轮辩论
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>
      <button
        onClick={onExport}
        className="inline-flex items-center gap-2 rounded-full bg-card/70 px-4 py-2 text-[12px] text-foreground/75 transition-all hover:bg-card hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" />
        导出 Markdown
      </button>
      <button
        onClick={onToggleRecap}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] transition-all ${
          recapOpen
            ? 'bg-warm/12 text-warm'
            : 'bg-card/40 text-muted-foreground/70 hover:bg-card/70 hover:text-foreground'
        }`}
      >
        <History className="h-3.5 w-3.5" />
        {recapOpen ? '收起完整时间线' : '查看完整时间线'}
      </button>
    </div>
  );
}
