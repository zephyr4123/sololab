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
    return <span className="text-xs text-muted-foreground/60">加载模板...</span>;
  }

  return (
    <select
      value={templateId}
      onChange={(e) => setTemplateId(e.target.value)}
      className="text-xs bg-transparent border border-border/50 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-warm/40 text-foreground/80 cursor-pointer hover:border-border transition-colors"
    >
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} {t.page_limit ? `(${t.page_limit}p)` : ''}
        </option>
      ))}
      {templates.length === 0 && <option value="nature">Nature Article</option>}
    </select>
  );
}
