'use client';

import { useState } from 'react';
import { useWriterStore } from '@/stores/module-stores/writer-store';
import SectionRenderer from './SectionRenderer';
import ReferenceList from './ReferenceList';
import FigureDisplay from './FigureDisplay';
import DocumentToolbar from './DocumentToolbar';
import OutlineNav from './OutlineNav';
import KnowledgePanel from './KnowledgePanel';

export default function DocumentPreview() {
  const {
    title, phase, sections, figures, streamingSectionId,
    selectedSectionId, setSelectedSection, wordCount, templateId,
  } = useWriterStore();

  const [showOutline, setShowOutline] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);

  const handleToggleOutline = () => {
    setShowOutline((v) => !v);
    if (!showOutline) setShowKnowledge(false);
  };

  const handleToggleKnowledge = () => {
    setShowKnowledge((v) => !v);
    if (!showKnowledge) setShowOutline(false);
  };

  // Figures with a section_id are inlined into section.content via the
  // `insert_figure` tool, so we only need to render document-level (global)
  // figures separately. Section-level figures appear inside SectionRenderer.
  const globalFigures = figures.filter((f) => !f.sectionId);

  const isDouble = templateId === 'cvpr' || templateId === 'iccv' || templateId === 'acm';

  return (
    <div className="flex flex-col h-full bg-[#FAFAF8] dark:bg-[#161614]">
      <DocumentToolbar
        showOutline={showOutline}
        onToggleOutline={handleToggleOutline}
        showKnowledge={showKnowledge}
        onToggleKnowledge={handleToggleKnowledge}
      />

      <div className="flex flex-1 min-h-0">
        {/* Outline panel — collapsible left */}
        {showOutline && (
          <div className="w-48 shrink-0 border-r border-border/30 overflow-y-auto bg-card/40 animate-fade-in">
            <OutlineNav />
          </div>
        )}

        {/* Paper canvas */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[780px] mx-auto my-6 px-6">
            <div className="bg-white dark:bg-[#1E1D1B] rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.2)] border border-black/[0.04] dark:border-white/[0.04]">
              <div className="px-10 py-8">
                {/* Empty state */}
                {phase === 'idle' && sections.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-20 h-1 bg-gradient-to-r from-transparent via-border to-transparent mb-8" />
                    <p className="text-muted-foreground/60 text-sm font-serif italic">
                      论文将在 AI 撰写时实时呈现
                    </p>
                    <p className="text-muted-foreground/40 text-xs mt-2">
                      每个章节将以流式方式实时生成
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

                {/* Sections — figures are inlined inside section.content */}
                <div className={isDouble ? 'columns-2 gap-6' : ''}>
                  {sections.map((section) => (
                    <div key={section.id} className={isDouble ? 'break-inside-avoid mb-4' : 'mb-6'}>
                      <SectionRenderer
                        section={section}
                        isStreaming={streamingSectionId === section.id}
                        isSelected={selectedSectionId === section.id}
                        onSelect={() => setSelectedSection(section.id)}
                      />
                    </div>
                  ))}
                </div>

                {/* References */}
                <ReferenceList />

                {/* Global figures — those without a section_id */}
                {globalFigures.map((fig) => (
                  <FigureDisplay key={fig.id} figure={fig} />
                ))}
              </div>
            </div>

            {/* Page info footer */}
            {wordCount > 0 && (
              <div className="text-center py-3">
                <span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums">
                  {wordCount.toLocaleString()} 字 · {sections.filter(s => s.status === 'complete').length}/{sections.length} 章节
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Knowledge drawer — collapsible right */}
        {showKnowledge && (
          <div className="w-64 shrink-0 border-l border-border/30 bg-card/40 animate-slide-in-right">
            <KnowledgePanel onClose={() => setShowKnowledge(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
