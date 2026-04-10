'use client';

import { useWriterStore } from '@/stores/module-stores/writer-store';
import SectionRenderer from './SectionRenderer';
import ReferenceList from './ReferenceList';
import FigureDisplay from './FigureDisplay';
import DocumentToolbar from './DocumentToolbar';

export default function DocumentPreview() {
  const {
    title, phase, sections, figures, streamingSectionId,
    selectedSectionId, setSelectedSection, costUsd,
  } = useWriterStore();

  // Group figures by section
  const figuresBySection = new Map<string, typeof figures>();
  for (const fig of figures) {
    const sid = fig.sectionId || '__global__';
    if (!figuresBySection.has(sid)) figuresBySection.set(sid, []);
    figuresBySection.get(sid)!.push(fig);
  }

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      <DocumentToolbar />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        {title && (
          <h1 className="text-xl font-display font-bold text-foreground leading-tight">
            {title}
          </h1>
        )}

        {/* Empty state */}
        {phase === 'idle' && sections.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center">
            <div className="w-12 h-12 rounded-full bg-accent/50 flex items-center justify-center mb-4">
              <span className="text-2xl">📝</span>
            </div>
            <p className="text-muted-foreground text-sm">
              Start a conversation to generate your paper.
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              The document preview will appear here in real time.
            </p>
          </div>
        )}

        {/* Sections */}
        {sections.map((section) => (
          <div key={section.id}>
            <SectionRenderer
              section={section}
              isStreaming={streamingSectionId === section.id}
              isSelected={selectedSectionId === section.id}
              onSelect={() => setSelectedSection(section.id)}
            />
            {/* Figures for this section */}
            {figuresBySection.get(section.id)?.map((fig) => (
              <FigureDisplay key={fig.id} figure={fig} />
            ))}
          </div>
        ))}

        {/* References */}
        <ReferenceList />

        {/* Global figures (no section) */}
        {figuresBySection.get('__global__')?.map((fig) => (
          <FigureDisplay key={fig.id} figure={fig} />
        ))}
      </div>

      {/* Footer: cost */}
      {costUsd > 0 && (
        <div className="px-4 py-1.5 border-t border-border text-[10px] text-muted-foreground text-right">
          Cost: ${costUsd.toFixed(4)}
        </div>
      )}
    </div>
  );
}
