'use client';

/**
 * WriterShell — module entry point + layout controller.
 *
 * Picks between two layouts based on whether the current document has any
 * conversation or written sections:
 *
 *   - STAGE  : empty-state focused compose surface (ComposeStage).
 *   - SPLIT  : DocumentRail + ChatPanel + DocumentPreview.
 *
 * The shell owns three cross-cutting concerns:
 *   1. Restoring the user's last document on first mount.
 *   2. Document-list state (shared between the stage pill, rail, and drawer).
 *   3. The global ⌘B / Ctrl+B shortcut to toggle the doc drawer.
 *
 * Components are split by responsibility:
 *   - stage/        : empty-state composition
 *   - split/        : working-state three-column layout
 *   - documents/    : doc list rendering + drawer
 *   - compose/      : shared prompt input
 *   - hooks/        : SSE wiring + document data layer
 */

import { useCallback, useEffect, useState } from 'react';
import { useWriterStore } from '@/stores/module-stores/writer-store';
import ComposeStage from './stage/ComposeStage';
import DocumentRail from './split/DocumentRail';
import ChatPanel from './split/ChatPanel';
import DocumentPreview from './preview/DocumentPreview';
import DocumentDrawer from './documents/DocumentDrawer';
import { useWriterDocuments } from './hooks/useWriterDocuments';

export default function WriterShell({ moduleId: _moduleId }: { moduleId: string }) {
  const chatEntries = useWriterStore((s) => s.chatEntries);
  const sections = useWriterStore((s) => s.sections);
  const docId = useWriterStore((s) => s.docId);
  const loadLastDocument = useWriterStore((s) => s.loadLastDocument);

  const isStage = chatEntries.length === 0 && sections.length === 0;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const documents = useWriterDocuments();

  // Restore the user's last document on first mount (persisted via localStorage).
  useEffect(() => {
    if (!docId) {
      void loadLastDocument();
    }
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘B / Ctrl+B toggles the document drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setDrawerOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative h-full">
      {isStage ? (
        <ComposeStage
          onOpenDrawer={openDrawer}
          recentDocsCount={documents.docs.length}
        />
      ) : (
        <div className="flex h-full">
          <DocumentRail documents={documents} onOpenDrawer={openDrawer} />
          <ChatPanel onOpenDrawer={openDrawer} />
          <div className="flex-1 min-w-0">
            <DocumentPreview />
          </div>
        </div>
      )}
      <DocumentDrawer open={drawerOpen} onClose={closeDrawer} documents={documents} />
    </div>
  );
}
