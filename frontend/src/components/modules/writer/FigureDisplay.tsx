'use client';

import type { WriterFigure } from '@/stores/module-stores/writer-store';

interface FigureDisplayProps {
  figure: WriterFigure;
}

export default function FigureDisplay({ figure }: FigureDisplayProps) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const imgSrc = figure.url.startsWith('http') ? figure.url : `${apiBase}${figure.url}`;

  return (
    <figure className="rounded-lg border border-border/60 p-4 my-4 bg-card/30">
      <div className="flex justify-center rounded overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={figure.caption}
          className="max-w-full max-h-[400px] object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
      <figcaption className="text-xs text-muted-foreground mt-3 text-center leading-relaxed">
        <span className="font-semibold text-foreground/70">图 {figure.number || figure.order}.</span>{' '}
        {figure.caption}
      </figcaption>
    </figure>
  );
}
