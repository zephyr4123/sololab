'use client';

import { useEffect, useRef } from 'react';
import type { WriterSection } from '@/stores/module-stores/writer-store';

interface SectionRendererProps {
  section: WriterSection;
  isStreaming: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

export default function SectionRenderer({ section, isStreaming, isSelected, onSelect }: SectionRendererProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [section.content, isStreaming]);

  return (
    <div
      className={`group transition-all cursor-pointer rounded-sm ${
        isSelected ? 'ring-1 ring-[var(--warm-highlight)]/30 bg-amber-50/30 dark:bg-amber-950/10' : 'hover:bg-accent/10'
      }`}
      onClick={onSelect}
    >
      {/* Section heading — academic style */}
      <div className="flex items-baseline justify-between mb-1.5 px-1">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground/80 font-serif">
          {section.title}
        </h2>
        <div className="flex items-center gap-2">
          {section.wordCount > 0 && (
            <span className="text-[10px] text-muted-foreground/50 font-mono">{section.wordCount}w</span>
          )}
          {isStreaming && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--warm-highlight)] animate-pulse" />
              <span className="text-[10px] text-[var(--warm-highlight)]/80">writing</span>
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {section.status === 'empty' ? (
        <div className="px-1 py-3 border-l-2 border-dashed border-border/30 ml-0.5">
          <p className="text-xs text-muted-foreground/40 italic font-serif">Awaiting content...</p>
        </div>
      ) : (
        <div
          ref={contentRef}
          className="px-1 text-[13px] leading-[1.7] text-foreground/85 font-serif max-h-[500px] overflow-y-auto
            [&_p]:mb-2 [&_p]:text-justify
            [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:mb-2 [&_ul_li]:mb-0.5
            [&_ol]:ml-4 [&_ol]:list-decimal [&_ol]:mb-2 [&_ol_li]:mb-0.5
            [&_strong]:font-semibold [&_em]:italic"
          dangerouslySetInnerHTML={{ __html: section.content }}
        />
      )}

      {/* Streaming cursor */}
      {isStreaming && section.content && (
        <span className="inline-block w-0.5 h-4 bg-[var(--warm-highlight)] animate-pulse ml-1 -mb-1" />
      )}
    </div>
  );
}
