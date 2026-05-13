'use client';

import { useWriterStore } from '@/stores/module-stores/writer-store';
import { writerApi } from '@/lib/api-client';
import TemplateSelector from '../compose/TemplateSelector';

export default function DocumentToolbar() {
  const { docId, wordCount, phase, sections, isExporting, setIsExporting } = useWriterStore();

  const completedSections = sections.filter((s) => s.status === 'complete').length;
  const totalSections = sections.length;

  const handleExport = async () => {
    if (!docId) return;
    setIsExporting(true);
    try {
      const res = await writerApi.exportDocument(docId);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'paper.pdf';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // handled
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative h-[52px] flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <TemplateSelector />
      </div>

      <div className="flex items-center gap-3">
        {totalSections > 0 && (
          <span className="text-[11px] text-muted-foreground/55 tabular-nums">
            {completedSections}/{totalSections} 章节
          </span>
        )}
        {wordCount > 0 && (
          <>
            <span className="text-muted-foreground/25">·</span>
            <span className="text-[11px] text-muted-foreground/55 font-mono tabular-nums">
              {wordCount.toLocaleString()} 字
            </span>
          </>
        )}
        {phase !== 'idle' && (
          <button
            onClick={handleExport}
            disabled={isExporting || !docId}
            className="ml-2 text-xs px-3 py-1.5 rounded-md border border-border/40 hover:bg-warm/8 hover:border-warm/30 transition-all disabled:opacity-30 text-foreground/70"
          >
            {isExporting ? '导出中...' : '导出 PDF'}
          </button>
        )}
      </div>
    </div>
  );
}
