'use client';

import { useWriterStore } from '@/stores/module-stores/writer-store';
import SectionRenderer from './SectionRenderer';
import ReferenceList from './ReferenceList';
import FigureDisplay from './FigureDisplay';
import DocumentToolbar from './DocumentToolbar';

export default function DocumentPreview() {
  const {
    title, phase, sections, figures, streamingSectionId,
    selectedSectionId, setSelectedSection, wordCount, templateId,
  } = useWriterStore();

  // Group figures by section
  const figuresBySection = new Map<string, typeof figures>();
  for (const fig of figures) {
    const sid = fig.sectionId || '__global__';
    if (!figuresBySection.has(sid)) figuresBySection.set(sid, []);
    figuresBySection.get(sid)!.push(fig);
  }

  const isDouble = templateId === 'cvpr' || templateId === 'iccv' || templateId === 'acm';

  return (
    <div className="flex flex-col h-full bg-[#FAFAF8] dark:bg-[#161614]">
      <DocumentToolbar />

      <div className="flex-1 overflow-y-auto">
        {/* Paper canvas with subtle shadow — mimics a real paper sheet */}
        <div className="max-w-[780px] mx-auto my-6 px-6">
          <div className="bg-white dark:bg-[#1E1D1B] rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.2)] border border-black/[0.04] dark:border-white/[0.04]">
            <div className="px-10 py-8">
              {/* Empty state */}
              {phase === 'idle' && sections.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-20 h-1 bg-gradient-to-r from-transparent via-border to-transparent mb-8" />
                  <p className="text-muted-foreground/60 text-sm font-serif italic">
                    Your paper will appear here as WriterAI composes it.
                  </p>
                  <p className="text-muted-foreground/40 text-xs mt-2">
                    Each section streams in real time.
                  </p>
                  <div className="w-20 h-1 bg-gradient-to-r from-transparent via-border to-transparent mt-8" />
                </div>
              )}

              {/* Title */}
              {title && (
                <div className="text-center mb-8">
                  <h1 className="text-xl font-bold leading-tight tracking-tight font-serif text-foreground">
                    {title}
                  </h1>
                  <div className="w-16 h-px bg-border mx-auto mt-4" />
                </div>
              )}

              {/* Sections */}
              <div className={isDouble ? 'columns-2 gap-6' : ''}>
                {sections.map((section) => (
                  <div key={section.id} className={isDouble ? 'break-inside-avoid mb-4' : 'mb-6'}>
                    <SectionRenderer
                      section={section}
                      isStreaming={streamingSectionId === section.id}
                      isSelected={selectedSectionId === section.id}
                      onSelect={() => setSelectedSection(section.id)}
                    />
                    {figuresBySection.get(section.id)?.map((fig) => (
                      <FigureDisplay key={fig.id} figure={fig} />
                    ))}
                  </div>
                ))}
              </div>

              {/* References */}
              <ReferenceList />

              {/* Global figures */}
              {figuresBySection.get('__global__')?.map((fig) => (
                <FigureDisplay key={fig.id} figure={fig} />
              ))}
            </div>
          </div>

          {/* Page info footer */}
          {wordCount > 0 && (
            <div className="text-center py-3">
              <span className="text-[10px] text-muted-foreground/40 font-mono">
                {wordCount.toLocaleString()} words · {sections.filter(s => s.status === 'complete').length}/{sections.length} sections
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
