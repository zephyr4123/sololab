'use client';

import { useWriterStore } from '@/stores/module-stores/writer-store';
import { writerApi } from '@/lib/api-client';
import TemplateSelector from './TemplateSelector';

interface DocumentToolbarProps {
  showOutline: boolean;
  onToggleOutline: () => void;
  showKnowledge: boolean;
  onToggleKnowledge: () => void;
}

export default function DocumentToolbar({ showOutline, onToggleOutline, showKnowledge, onToggleKnowledge }: DocumentToolbarProps) {
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
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-card/30 shrink-0">
      <div className="flex items-center gap-2">
        <TemplateSelector />

        {totalSections > 0 && <div className="w-px h-4 bg-border/40" />}

        {/* Outline toggle */}
        <button
          onClick={onToggleOutline}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors ${
            showOutline ? 'bg-warm/10 text-warm' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 12H3"/><path d="M16 6H3"/><path d="M10 18H3"/></svg>
          大纲
        </button>

        {/* Knowledge toggle */}
        <button
          onClick={onToggleKnowledge}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors ${
            showKnowledge ? 'bg-warm/10 text-warm' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19v20H6.5a2.5 2.5 0 0 1 0-5H19"/></svg>
          知识库
        </button>
      </div>

      <div className="flex items-center gap-3">
        {totalSections > 0 && (
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
            {completedSections}/{totalSections} 章节
          </span>
        )}
        {wordCount > 0 && (
          <>
            <div className="w-px h-3.5 bg-border/30" />
            <span className="text-[11px] text-muted-foreground/60 font-mono tabular-nums">
              {wordCount.toLocaleString()} 字
            </span>
          </>
        )}
        {phase !== 'idle' && (
          <>
            <div className="w-px h-3.5 bg-border/30" />
            <button
              onClick={handleExport}
              disabled={isExporting || !docId}
              className="text-xs px-3 py-1.5 rounded-md border border-border/50 hover:bg-accent/40 transition-colors disabled:opacity-30 text-foreground/70"
            >
              {isExporting ? '导出中...' : '导出 PDF'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
