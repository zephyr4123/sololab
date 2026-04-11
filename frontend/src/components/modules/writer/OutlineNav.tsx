'use client';

import { useWriterStore } from '@/stores/module-stores/writer-store';

export default function OutlineNav() {
  const { sections, selectedSectionId, setSelectedSection, streamingSectionId } = useWriterStore();

  if (sections.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-xs text-muted-foreground/40">大纲将在生成后显示</p>
      </div>
    );
  }

  return (
    <nav className="py-1">
      {sections.map((sec) => (
        <button
          key={sec.id}
          onClick={() => setSelectedSection(sec.id)}
          className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs text-left transition-colors ${
            selectedSectionId === sec.id
              ? 'bg-warm/10 text-foreground border-r-2 border-warm'
              : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            sec.status === 'complete' ? 'bg-green-500' :
            sec.status === 'writing' ? 'bg-warm animate-pulse' :
            'bg-muted-foreground/20'
          }`} />
          <span className="truncate flex-1">{sec.title}</span>
          {sec.wordCount > 0 && (
            <span className="text-[10px] text-muted-foreground/40 tabular-nums">{sec.wordCount}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
