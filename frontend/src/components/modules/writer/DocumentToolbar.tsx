'use client';

import { useWriterStore } from '@/stores/module-stores/writer-store';
import { writerApi } from '@/lib/api-client';
import TemplateSelector from './TemplateSelector';

export default function DocumentToolbar() {
  const { docId, wordCount, phase, sections, isExporting, setIsExporting } = useWriterStore();

  const completedSections = sections.filter((s) => s.status === 'complete').length;
  const totalSections = sections.length;

  const handleExport = async () => {
    if (!docId) return;
    setIsExporting(true);
    try {
      const res = await writerApi.exportDocument(docId);
      if (res.status === 501) {
        alert('Word export will be available in Phase 6.3');
      } else if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'paper.docx';
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
    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
      <div className="flex items-center gap-4">
        <TemplateSelector />
        {totalSections > 0 && (
          <span className="text-xs text-muted-foreground">
            {completedSections}/{totalSections} sections
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-mono">
          {wordCount.toLocaleString()} words
        </span>
        {phase !== 'idle' && (
          <button
            onClick={handleExport}
            disabled={isExporting || !docId}
            className="text-xs px-3 py-1 rounded border border-border hover:bg-accent transition-colors disabled:opacity-40"
          >
            {isExporting ? 'Exporting...' : 'Export Word'}
          </button>
        )}
      </div>
    </div>
  );
}
