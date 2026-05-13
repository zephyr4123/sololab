'use client';

/**
 * useWriterDocuments — shared data layer for any UI that lists writer documents
 * (Drawer, Rail, future doc switchers). Owns the fetch loop, refresh-after-stream,
 * and the switch / delete / new actions. Components stay presentational.
 *
 * Fetches on mount + ~600ms after streaming ends so a newly-created doc surfaces
 * without manual refresh.
 */

import { useCallback, useEffect, useState } from 'react';
import { writerApi, type WriterDocumentSummary } from '@/lib/api-client';
import { useWriterStore } from '@/stores/module-stores/writer-store';

export interface UseWriterDocumentsResult {
  docs: WriterDocumentSummary[];
  activeDocId: string | null;
  isLoading: boolean;
  loadingDocId: string | null;
  deletingDocId: string | null;
  isStreaming: boolean;
  refresh: () => Promise<void>;
  /** Switch to a document. Returns true if the switch was performed,
   *  false if it was a no-op (already active, mid-switch, or streaming). */
  switchTo: (id: string) => Promise<boolean>;
  deleteDoc: (id: string) => Promise<void>;
  newDoc: () => void;
}

export function useWriterDocuments(): UseWriterDocumentsResult {
  const activeDocId = useWriterStore((s) => s.docId);
  const isStreaming = useWriterStore((s) => s.isStreaming);
  const loadDocument = useWriterStore((s) => s.loadDocument);
  const newDocument = useWriterStore((s) => s.newDocument);

  const [docs, setDocs] = useState<WriterDocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await writerApi.listDocuments();
      setDocs(
        Array.isArray(list)
          ? [...list].sort(
              (a, b) =>
                new Date(b.updated_at || b.created_at).getTime() -
                new Date(a.updated_at || a.created_at).getTime(),
            )
          : [],
      );
    } catch (e) {
      console.error('Failed to load writer documents', e);
      setDocs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh shortly after streaming ends so newly-created docs surface.
  useEffect(() => {
    if (!isStreaming) {
      const t = setTimeout(() => void refresh(), 600);
      return () => clearTimeout(t);
    }
  }, [isStreaming, refresh]);

  const switchTo = useCallback(
    async (id: string): Promise<boolean> => {
      if (id === activeDocId || loadingDocId || isStreaming) return false;
      setLoadingDocId(id);
      try {
        await loadDocument(id);
        return true;
      } finally {
        setLoadingDocId(null);
      }
    },
    [activeDocId, loadingDocId, isStreaming, loadDocument],
  );

  const deleteDoc = useCallback(
    async (id: string) => {
      if (deletingDocId) return;
      setDeletingDocId(id);
      try {
        await writerApi.deleteDocument(id);
        setDocs((prev) => prev.filter((d) => d.doc_id !== id));
        if (id === activeDocId) newDocument();
      } catch (err) {
        console.error('Failed to delete doc', err);
      } finally {
        setDeletingDocId(null);
      }
    },
    [deletingDocId, activeDocId, newDocument],
  );

  return {
    docs,
    activeDocId,
    isLoading,
    loadingDocId,
    deletingDocId,
    isStreaming,
    refresh,
    switchTo,
    deleteDoc,
    newDoc: newDocument,
  };
}
