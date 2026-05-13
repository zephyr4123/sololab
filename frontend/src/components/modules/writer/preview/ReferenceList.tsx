'use client';

import { useWriterStore } from '@/stores/module-stores/writer-store';

export default function ReferenceList() {
  const references = useWriterStore((s) => s.references);

  if (references.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-border/60">
      <h3 className="text-sm font-bold font-serif uppercase tracking-wide text-foreground/80 mb-4">
        参考文献
      </h3>
      <ol className="space-y-2.5">
        {references.map((ref) => (
          <li key={ref.number} className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground/70">[{ref.number}]</span>{' '}
            {ref.authors && ref.authors.length > 0 && (
              <span>
                {ref.authors.slice(0, 3).join(', ')}
                {ref.authors.length > 3 ? ' 等' : ''}
                .{' '}
              </span>
            )}
            <span className="font-medium">{ref.title}</span>
            {ref.venue && <span className="italic">. {ref.venue}</span>}
            {ref.year && <span> ({ref.year})</span>}
            {ref.doi && <span>. doi:{ref.doi}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
