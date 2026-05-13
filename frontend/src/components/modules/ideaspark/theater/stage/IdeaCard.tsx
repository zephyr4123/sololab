'use client';

/**
 * IdeaCard — a finished idea floated into the stage when an agent emits
 * an `idea` event. Hairless: a faint warm tint on the left edge + a
 * soft drop shadow stand in for a border. Emerge animation comes from
 * the .idea-emerge utility.
 */

import { AgentSigil } from '../../shared/AgentSigil';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

interface IdeaCardProps {
  author: string;
  content: string;
}

export function IdeaCard({ author, content }: IdeaCardProps) {
  return (
    <article
      className="idea-emerge relative rounded-xl bg-card/60 px-4 py-3.5 shadow-[0_4px_22px_-12px_rgba(0,0,0,0.10)] dark:shadow-[0_6px_22px_-10px_rgba(0,0,0,0.5)]"
      style={{
        backgroundImage:
          'linear-gradient(to right, color-mix(in oklab, var(--color-warm) 7%, transparent) 0%, transparent 60%)',
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
        style={{
          background:
            'linear-gradient(to bottom, transparent, color-mix(in oklab, var(--color-warm) 60%, transparent) 30%, color-mix(in oklab, var(--color-warm) 60%, transparent) 70%, transparent)',
        }}
      />
      <header className="mb-2 flex items-center justify-between">
        <AgentSigil agent={author} state="done" size="sm" />
        <span className="text-[9.5px] uppercase tracking-[0.22em] text-warm/70 font-medium">
          new idea
        </span>
      </header>
      <div className="text-[12.5px]">
        <MarkdownViewer content={content} compact />
      </div>
    </article>
  );
}
