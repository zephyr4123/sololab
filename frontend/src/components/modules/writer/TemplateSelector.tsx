'use client';

import { useEffect, useState } from 'react';
import { writerApi, type WriterTemplate } from '@/lib/api-client';
import { useWriterStore } from '@/stores/module-stores/writer-store';

export default function TemplateSelector() {
  const [templates, setTemplates] = useState<WriterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const templateId = useWriterStore((s) => s.templateId);
  const setTemplateId = useWriterStore((s) => s.setTemplateId);

  useEffect(() => {
    writerApi.listTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-xs text-muted-foreground">Loading templates...</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground whitespace-nowrap">Template:</label>
      <select
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        className="text-xs bg-card border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--warm-highlight)]"
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} {t.page_limit ? `(${t.page_limit}p)` : ''}
          </option>
        ))}
        {templates.length === 0 && <option value="nature">Nature Article</option>}
      </select>
    </div>
  );
}
