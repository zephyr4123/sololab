'use client';

/**
 * WriterShell — module entry point + layout controller.
 *
 * Two surfaces (mirrors IdeaSparkShell's Stage / Theater / Curtain
 * pattern, condensed to two states since Writer doesn't have a
 * finalised "results" surface):
 *
 *   - STAGE  : empty-state focused compose surface (ComposeStage).
 *   - SPLIT  : DocumentRail + ChatPanel + DocumentPreview, with a
 *              top context strip (title + phase + navigation).
 *
 * Mount-time freshness:
 *   The writer store is a singleton in memory — client-side nav from
 *   Home back into this module does NOT unmount it, so a finished
 *   document (phase='complete' + sections) sits there until something
 *   clears it. We detect that "stale SPLIT" on mount and reset, so the
 *   user always lands on a clean Compose stage unless they explicitly
 *   open a document from the drawer. An in-flight stream (phase='writing')
 *   is preserved so context-switching mid-draft doesn't lose work.
 *
 * What we removed: previously this shell called `loadLastDocument()`
 * on mount, which would silently reopen whichever document the user
 * had touched last. That broke the user's mental model — clicking
 * the sidebar should land on a fresh page, not strand the user in
 * yesterday's draft. The DocumentDrawer (⌘B, or via the strip)
 * surfaces the latest document at the top of the list, so getting
 * back to it is one click.
 *
 * Components are split by responsibility:
 *   - stage/        : empty-state composition
 *   - split/        : working-state three-column layout + context strip
 *   - documents/    : doc list rendering + drawer
 *   - compose/      : shared prompt input
 *   - hooks/        : SSE wiring + document data layer
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWriterStore } from '@/stores/module-stores/writer-store';
import ComposeStage from './stage/ComposeStage';
import DocumentRail from './split/DocumentRail';
import ChatPanel from './split/ChatPanel';
import DocumentPreview from './preview/DocumentPreview';
import DocumentDrawer from './documents/DocumentDrawer';
import WriterContextStrip from './split/WriterContextStrip';
import { useWriterDocuments } from './hooks/useWriterDocuments';

export default function WriterShell({ moduleId: _moduleId }: { moduleId: string }) {
  const chatEntries = useWriterStore((s) => s.chatEntries);
  const sections = useWriterStore((s) => s.sections);
  const docId = useWriterStore((s) => s.docId);
  const title = useWriterStore((s) => s.title);
  const phase = useWriterStore((s) => s.phase);

  const isStage = chatEntries.length === 0 && sections.length === 0;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const documents = useWriterDocuments();

  // Stale-SPLIT detection — see header comment. Runs once per mount.
  // If we land here with a finished document's state still in the
  // store, wipe it so the user sees Stage. Active streams (writing)
  // are left alone so context-switching mid-draft doesn't lose work.
  useEffect(() => {
    const s = useWriterStore.getState();
    const isStaleSplit =
      s.phase === 'complete' &&
      s.sections.length > 0 &&
      !s.isStreaming;
    if (isStaleSplit) {
      s.reset();
    }
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

  const handleNewDocument = useCallback(() => {
    useWriterStore.getState().reset();
  }, []);

  // Look up the current document's metadata for the context strip's
  // relative-time chip. The strip degrades gracefully if it's missing.
  const updatedAtMs = useMemo(() => {
    const doc = documents.docs.find((d) => d.doc_id === docId);
    if (!doc?.updated_at) return undefined;
    const ms = new Date(doc.updated_at).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : undefined;
  }, [documents.docs, docId]);

  return (
    <div className="relative h-full">
      {isStage ? (
        <ComposeStage
          onOpenDrawer={openDrawer}
          recentDocsCount={documents.docs.length}
        />
      ) : (
        <div className="flex h-full flex-col">
          <WriterContextStrip
            title={title}
            phase={phase}
            updatedAtMs={updatedAtMs}
            onNewDocument={handleNewDocument}
            onOpenDrawer={openDrawer}
          />
          {/* Three-column working layout — one faint hairline along
              the top is the only border; pane boundaries are conveyed
              by spacing + the floating paper canvas, not by lines. */}
          <div className="flex flex-1 min-h-0 border-t border-border/25">
            <DocumentRail documents={documents} onOpenDrawer={openDrawer} />
            <ChatPanel onOpenDrawer={openDrawer} />
            <div className="flex-1 min-w-0">
              <DocumentPreview />
            </div>
          </div>
        </div>
      )}
      <DocumentDrawer open={drawerOpen} onClose={closeDrawer} documents={documents} />
    </div>
  );
}
