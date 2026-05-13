'use client';

/**
 * ChatPanel — the conversation column in SPLIT mode.
 *
 * Renders chat history + a live status pill while streaming + the compact
 * ComposeInput pinned at the bottom. Auto-scrolls to bottom on new entries.
 *
 * Header is intentionally minimal (just the writer mark + a drawer button);
 * template selection and document title live in the document toolbar on
 * the right pane, which keeps this column laser-focused on conversation.
 */

import { useEffect, useRef } from 'react';
import { Menu, PenTool } from 'lucide-react';
import { useWriterStore } from '@/stores/module-stores/writer-store';
import ComposeInput from '../compose/ComposeInput';
import { useWriterStream } from '../hooks/useWriterStream';
import ChatEntry from './ChatEntry';

interface ChatPanelProps {
  onOpenDrawer: () => void;
}

export default function ChatPanel({ onOpenDrawer }: ChatPanelProps) {
  const chatEntries = useWriterStore((s) => s.chatEntries);
  const agentStatus = useWriterStore((s) => s.agentStatus);
  const costUsd = useWriterStore((s) => s.costUsd);
  const { isStreaming, statusLabel } = useWriterStream();

  const endRef = useRef<HTMLDivElement>(null);

  // Smooth-scroll to the latest entry whenever the conversation grows
  // or the agent status pill updates.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatEntries, agentStatus]);

  return (
    <div className="flex flex-col w-[420px] min-w-[380px] max-w-[460px] shrink-0 border-r border-border/30">
      {/* Header — aligns to 52px with rail header + document toolbar */}
      <div className="h-[52px] px-4 border-b border-border/30 shrink-0 flex items-center gap-2">
        <button
          onClick={onOpenDrawer}
          title="文档列表 (⌘B)"
          className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent/40 transition-colors"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-border/40" />
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-warm/20 to-warm/5 flex items-center justify-center text-warm shrink-0">
            <PenTool className="h-3.5 w-3.5" strokeWidth={2.2} />
          </div>
          <h2 className="text-[13px] font-semibold tracking-tight truncate">WriterAI</h2>
          <span className="text-[10px] text-muted-foreground/40 truncate">
            学术论文写作助手
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {chatEntries.map((entry) => (
          <ChatEntry key={entry.id} entry={entry} />
        ))}

        {/* Live status pill */}
        {isStreaming && statusLabel && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-warm/5 border border-warm/10">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warm opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-warm" />
            </span>
            <span className="text-xs text-foreground/60 whitespace-nowrap">
              {statusLabel}
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border/30 shrink-0">
        <ComposeInput variant="chat" />
        {costUsd > 0 && (
          <p className="text-[10px] text-muted-foreground/40 mt-2 text-right tabular-nums">
            费用：${costUsd.toFixed(4)}
          </p>
        )}
      </div>
    </div>
  );
}
