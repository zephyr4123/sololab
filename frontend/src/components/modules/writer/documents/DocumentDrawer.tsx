'use client';

/**
 * DocumentDrawer — slide-out document switcher.
 *
 * Replaces the always-visible 260px sidebar with an overlay that opens only
 * when the user asks for it (drawer button or ⌘B). Backdrop + Esc to close.
 *
 * Always rendered in the DOM (just translated off-screen) so the open/close
 * animation is smooth and predictable. Backdrop is only mounted when open
 * to keep pointer events from being trapped when closed.
 */

import { useEffect } from 'react';
import { BookOpen, Plus, X } from 'lucide-react';
import type { UseWriterDocumentsResult } from '../hooks/useWriterDocuments';
import DocumentList from './DocumentList';

interface DocumentDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Document data + actions, owned by the parent shell so multiple
   *  surfaces (stage pill, drawer) share a single fetch + state. */
  documents: UseWriterDocumentsResult;
}

export default function DocumentDrawer({ open, onClose, documents }: DocumentDrawerProps) {
  const {
    docs,
    activeDocId,
    isLoading,
    loadingDocId,
    deletingDocId,
    isStreaming,
    switchTo,
    deleteDoc,
    newDoc,
  } = documents;

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSwitch = async (id: string) => {
    const ok = await switchTo(id);
    if (ok) onClose();
  };

  const handleNew = () => {
    newDoc();
    onClose();
  };

  return (
    <>
      {/* Backdrop — only mounted when open to avoid trapping pointer events */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/15 backdrop-blur-[2px] animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel — always in DOM, translated off-screen when closed */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-[300px] bg-card border-r border-border shadow-[8px_0_32px_-12px_rgba(0,0,0,0.15)] transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-hidden={!open}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="h-[52px] px-4 border-b border-border/30 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-warm/70" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
                我的论文
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNew}
                disabled={isStreaming}
                title="新建文档"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-warm hover:bg-warm/10 transition-colors disabled:opacity-30"
              >
                <Plus className="h-3 w-3" />
                新建
              </button>
              <button
                onClick={onClose}
                title="关闭 (Esc)"
                className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent/40 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            <DocumentList
              docs={docs}
              activeDocId={activeDocId}
              loadingDocId={loadingDocId}
              deletingDocId={deletingDocId}
              isLoading={isLoading}
              onSwitch={handleSwitch}
              onDelete={deleteDoc}
            />
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border/30 shrink-0">
            <p className="text-[10px] text-muted-foreground/40 tabular-nums">
              {docs.length > 0 ? `共 ${docs.length} 篇` : ''}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
