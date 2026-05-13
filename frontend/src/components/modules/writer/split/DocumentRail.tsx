'use client';

/**
 * DocumentRail — 60px always-visible document switcher.
 *
 * Collapsed state shows just a colored dot per document (warm for active,
 * muted for the rest). On hover, the rail floats out to 280px and reveals
 * titles. Click-switch is enabled in both states.
 *
 * Floats as an overlay (absolute) so expansion does NOT shift the chat
 * column to its right — feels like a panel sliding out from the edge.
 *
 * For full metadata + delete affordance the user opens the drawer via the
 * `BookOpen` icon in the header (or ⌘B). Rail is for fast switching.
 */

import { useState } from 'react';
import { BookOpen, Loader2, Plus } from 'lucide-react';
import type { WriterDocumentSummary } from '@/lib/api-client';
import type { UseWriterDocumentsResult } from '../hooks/useWriterDocuments';

interface DocumentRailProps {
  documents: UseWriterDocumentsResult;
  onOpenDrawer: () => void;
}

export default function DocumentRail({ documents, onOpenDrawer }: DocumentRailProps) {
  const [hovering, setHovering] = useState(false);
  const { docs, activeDocId, isStreaming, loadingDocId, switchTo, newDoc } = documents;

  return (
    <div className="relative w-[60px] h-full shrink-0 z-30">
      <aside
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`absolute inset-y-0 left-0 flex flex-col transition-[width,box-shadow,background-color] duration-200 ease-out overflow-hidden ${
          hovering
            ? 'w-[280px] bg-card/95 backdrop-blur-sm shadow-[8px_0_28px_-14px_rgba(0,0,0,0.22)] dark:shadow-[8px_0_28px_-14px_rgba(0,0,0,0.55)]'
            : 'w-[60px] bg-transparent'
        }`}
      >
        {/* Header — opens the full drawer */}
        <div className="h-[52px] flex items-center shrink-0 px-3">
          <button
            onClick={onOpenDrawer}
            title="完整文档列表 (⌘B)"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-warm/80 hover:bg-warm/10 transition-colors shrink-0"
          >
            <BookOpen className="h-4 w-4" />
          </button>
          <span
            className={`ml-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60 whitespace-nowrap transition-opacity duration-150 ${
              hovering ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            我的论文
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-none">
          {docs.length === 0 ? (
            <div
              className={`px-2 py-6 text-center transition-opacity duration-150 ${
                hovering ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <p className="text-[11px] text-muted-foreground/40 leading-relaxed whitespace-nowrap">
                还没有论文
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {docs.map((doc) => (
                <RailItem
                  key={doc.doc_id}
                  doc={doc}
                  isActive={doc.doc_id === activeDocId}
                  isSwitching={loadingDocId === doc.doc_id}
                  disabled={isStreaming && doc.doc_id !== activeDocId}
                  expanded={hovering}
                  onClick={() => switchTo(doc.doc_id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer — new doc */}
        <div className="shrink-0 px-2 py-2.5">
          <button
            onClick={newDoc}
            disabled={isStreaming}
            title="新建文档"
            className="group/new flex h-9 w-full items-center rounded-lg text-warm hover:bg-warm/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus
              className={`h-4 w-4 shrink-0 transition-all duration-150 ${
                hovering ? 'mx-3' : 'mx-auto'
              }`}
            />
            <span
              className={`text-[11.5px] font-medium whitespace-nowrap transition-all duration-150 ${
                hovering ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'
              }`}
            >
              新建文档
            </span>
          </button>
        </div>
      </aside>
    </div>
  );
}

interface RailItemProps {
  doc: WriterDocumentSummary;
  isActive: boolean;
  isSwitching: boolean;
  disabled: boolean;
  expanded: boolean;
  onClick: () => void;
}

function RailItem({ doc, isActive, isSwitching, disabled, expanded, onClick }: RailItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isSwitching}
      title={doc.title || '未命名文档'}
      className={`group/r w-full flex items-center h-9 rounded-lg transition-all duration-150 ${
        isActive
          ? 'bg-warm/10 border border-warm/20'
          : 'border border-transparent hover:bg-foreground/[0.04] hover:border-border/40'
      } ${isSwitching ? 'opacity-60' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <span
        className={`h-2 w-2 rounded-full shrink-0 transition-all duration-150 ${
          expanded ? 'ml-2.5' : 'mx-auto'
        } ${
          isActive
            ? 'bg-warm'
            : 'bg-muted-foreground/30 group-hover/r:bg-muted-foreground/60'
        }`}
      />
      <span
        className={`text-[12px] truncate transition-all duration-150 ${
          expanded ? 'ml-3 opacity-100 max-w-[200px]' : 'ml-0 opacity-0 max-w-0'
        } ${isActive ? 'text-foreground font-medium' : 'text-foreground/80'}`}
      >
        {doc.title || '未命名文档'}
      </span>
      {isSwitching && expanded && (
        <Loader2 className="ml-auto mr-2 h-3 w-3 animate-spin text-warm shrink-0" />
      )}
    </button>
  );
}
