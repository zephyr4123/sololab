'use client';

import { useWriterStore } from '@/stores/module-stores/writer-store';

export default function OutlineNav() {
  const { sections, selectedSectionId, setSelectedSection, streamingSectionId } = useWriterStore();

  if (sections.length === 0) return null;

  const statusColors = {
    empty: 'bg-muted-foreground/20',
    writing: 'bg-[var(--warm-highlight)]',
    complete: 'bg-green-500',
  };

  return (
    <nav className="space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Outline</h4>
      {sections.map((sec) => (
        <button
          key={sec.id}
          onClick={() => setSelectedSection(sec.id)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
            selectedSectionId === sec.id
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColors[sec.status]} ${
            sec.id === streamingSectionId ? 'animate-pulse' : ''
          }`} />
          <span className="truncate">{sec.title}</span>
          {sec.wordCount > 0 && (
            <span className="ml-auto text-[10px] opacity-50">{sec.wordCount}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
