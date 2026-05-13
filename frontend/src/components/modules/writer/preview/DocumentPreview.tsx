'use client';

/**
 * DocumentPreview — paper canvas + ambient workspace.
 *
 * Rendering decisions:
 *   - Sections always flow top-to-bottom (single column), regardless of
 *     `templateId`. Multi-column behaviour (e.g. CVPR / ICCV / ACM) is a
 *     concern of PDF export — the live preview must stay stable while
 *     content streams in. CSS `columns-2` was rebalancing column heights
 *     on every delta, which made headings appear to leap between columns.
 *   - Paper canvas floats on the workspace via a soft compound shadow,
 *     no border, no hairline. The shadow is the only structural cue.
 *   - A very faint warm radial gradient anchors the top-right corner of
 *     the workspace — like a desk lamp throwing ambient light onto paper.
 */

import { useWriterStore } from '@/stores/module-stores/writer-store';
import SectionRenderer from './SectionRenderer';
import ReferenceList from './ReferenceList';
import FigureDisplay from './FigureDisplay';
import DocumentToolbar from './DocumentToolbar';

export default function DocumentPreview() {
  const {
    title,
    phase,
    sections,
    figures,
    streamingSectionId,
    selectedSectionId,
    setSelectedSection,
    wordCount,
  } = useWriterStore();

  // Figures with a section_id are inlined into section.content via the
  // `insert_figure` tool, so we only need to render document-level (global)
  // figures separately. Section-level figures appear inside SectionRenderer.
  const globalFigures = figures.filter((f) => !f.sectionId);

  return (
    <div className="relative flex flex-col h-full bg-[#FAFAF8] dark:bg-[#161614] overflow-hidden">
      {/* Ambient warm glow — top-right desk light */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-44 -right-44 h-[480px] w-[480px] rounded-full opacity-[0.05] dark:opacity-[0.08]"
        style={{
          background:
            'radial-gradient(circle, var(--color-warm) 0%, transparent 65%)',
        }}
      />

      <DocumentToolbar />

      <div className="relative flex flex-1 min-h-0">
        {/* Paper canvas */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[940px] mx-auto my-6 px-4">
            <div className="bg-white dark:bg-[#1E1D1B] rounded-sm shadow-[0_2px_8px_rgba(0,0,0,0.04),0_24px_56px_-16px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),0_24px_56px_-16px_rgba(0,0,0,0.45)]">
              <div className="px-12 py-10">
                {/* Empty state */}
                {phase === 'idle' && sections.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-20 h-px bg-gradient-to-r from-transparent via-border to-transparent mb-8" />
                    <p className="text-muted-foreground/60 text-sm font-serif italic">
                      论文将在 AI 撰写时实时呈现
                    </p>
                    <p className="text-muted-foreground/40 text-xs mt-2">
                      每个章节将以流式方式实时生成
                    </p>
                    <div className="w-20 h-px bg-gradient-to-r from-transparent via-border to-transparent mt-8" />
                  </div>
                )}

                {/* Title */}
                {title && (
                  <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold leading-tight tracking-tight font-serif text-foreground">
                      {title}
                    </h1>
                    <div className="w-16 h-px bg-border mx-auto mt-4" />
                  </div>
                )}

                {/* Sections — always single column, top-down. Multi-column
                    layout (for CVPR/ICCV/ACM) is exclusively a PDF export
                    concern; live preview must stay stable while streaming. */}
                <div className="space-y-6">
                  {sections.map((section) => (
                    <SectionRenderer
                      key={section.id}
                      section={section}
                      isStreaming={streamingSectionId === section.id}
                      isSelected={selectedSectionId === section.id}
                      onSelect={() => setSelectedSection(section.id)}
                    />
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
                  {wordCount.toLocaleString()} 字 ·{' '}
                  {sections.filter((s) => s.status === 'complete').length}/
                  {sections.length} 章节
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
