'use client';

import type { WriterFigure } from '@/stores/module-stores/writer-store';

interface FigureDisplayProps {
  figure: WriterFigure;
}

export default function FigureDisplay({ figure }: FigureDisplayProps) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const imgSrc = figure.url.startsWith('http') ? figure.url : `${apiBase}${figure.url}`;

  return (
    <figure className="rounded-lg border border-border p-3 my-3">
      <div className="flex justify-center bg-card rounded overflow-hidden">
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
      <figcaption className="text-xs text-muted-foreground mt-2 text-center">
        <span className="font-medium">Figure {figure.number || figure.order}.</span> {figure.caption}
      </figcaption>
    </figure>
  );
}
