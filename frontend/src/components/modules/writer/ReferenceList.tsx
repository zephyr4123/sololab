'use client';

import { useWriterStore } from '@/stores/module-stores/writer-store';

export default function ReferenceList() {
  const references = useWriterStore((s) => s.references);

  if (references.length === 0) return null;

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="font-semibold text-sm mb-3">References</h3>
      <ol className="space-y-2">
        {references.map((ref) => (
          <li key={ref.number} className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">[{ref.number}]</span>{' '}
            {ref.authors && ref.authors.length > 0 && (
              <span>{ref.authors.slice(0, 3).join(', ')}{ref.authors.length > 3 ? ' et al.' : ''}. </span>
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
