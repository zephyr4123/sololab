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

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [section.content, isStreaming]);

  const statusColors = {
    empty: 'border-border/50',
    writing: 'border-[var(--warm-highlight)] ring-1 ring-[var(--warm-highlight)]/20',
    complete: 'border-border',
  };

  const statusIcons = {
    empty: '○',
    writing: '◐',
    complete: '●',
  };

  return (
    <div
      className={`rounded-lg border p-4 transition-all cursor-pointer ${statusColors[section.status]} ${isSelected ? 'bg-accent/30' : 'hover:bg-accent/10'}`}
      onClick={onSelect}
    >
      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-60">{statusIcons[section.status]}</span>
          <h3 className="font-semibold text-sm">{section.title}</h3>
          <span className="text-xs text-muted-foreground capitalize">({section.type})</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {section.wordCount > 0 && `${section.wordCount} words`}
        </span>
      </div>

      {/* Content */}
      {section.status === 'empty' ? (
        <p className="text-xs text-muted-foreground italic">Waiting to be written...</p>
      ) : (
        <div
          ref={contentRef}
          className="prose prose-sm dark:prose-invert max-w-none max-h-[300px] overflow-y-auto text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: section.content }}
        />
      )}

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex items-center gap-1 mt-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--warm-highlight)] animate-pulse" />
          <span className="text-xs text-[var(--warm-highlight)]">Writing...</span>
        </div>
      )}
    </div>
  );
}
