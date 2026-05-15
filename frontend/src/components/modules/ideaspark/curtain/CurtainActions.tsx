'use client';

/**
 * CurtainActions — secondary content-level actions at the foot of
 * the Curtain. Two buttons:
 *   - Export markdown report
 *   - Toggle the full process recap (ProcessRecap below)
 *
 * Navigation actions ("新辩论", "切换历史") live in
 * `CurtainContextStrip` at the top of the Curtain, where the user
 * will see them on entry without scrolling. This split keeps the
 * hierarchy clear: top = where am I / how do I leave, bottom = what
 * can I do with this content.
 */

import { Clock, Download } from 'lucide-react';

interface CurtainActionsProps {
  onExport: () => void;
  onToggleRecap: () => void;
  recapOpen: boolean;
}

export function CurtainActions({
  onExport,
  onToggleRecap,
  recapOpen,
}: CurtainActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
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
        <Clock className="h-3.5 w-3.5" />
        {recapOpen ? '收起推演记录' : '查看推演记录'}
      </button>
    </div>
  );
}
