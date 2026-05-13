'use client';

/**
 * ComposeInput — shared prompt input that drives the writer pipeline.
 *
 * Two variants:
 *   - `stage` : large, card-like input shown in the empty-state hero.
 *               Template selector lives inside its footer.
 *   - `chat`  : compact, sticky-bottom input shown in SPLIT mode. Template
 *               selector is hidden (lives in the document toolbar instead).
 *
 * State (text, auto-grow, prefill) and submit logic are co-located here so
 * the two variants never drift. Both share the same `useWriterStream` hook
 * for actual send/stop — there is exactly one SSE client per page.
 */

import { useEffect, useRef, useState } from 'react';
import PlusMenu from './PlusMenu';
import TemplateSelector from './TemplateSelector';
import { useWriterStream } from '../hooks/useWriterStream';

export type ComposeVariant = 'stage' | 'chat';

interface ComposeInputProps {
  variant: ComposeVariant;
  /** Initial textarea value. Read once at mount only — to force a re-prefill,
   *  remount the component via a `key` change in the parent. */
  initialValue?: string;
}

export default function ComposeInput({ variant, initialValue }: ComposeInputProps) {
  const [text, setText] = useState(initialValue ?? '');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { send, stop, isStreaming } = useWriterStream();

  // On mount: if we have a prefill, focus the textarea and put the caret at
  // the end so the user can immediately edit + send.
  useEffect(() => {
    if (!initialValue) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
    // mount-only — re-prefill is handled via parent `key` change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-grow textarea up to a variant-specific max.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const max = variant === 'stage' ? 240 : 160;
    ta.style.height = Math.min(ta.scrollHeight, max) + 'px';
  }, [text, variant]);

  const submit = async () => {
    if (!text.trim() || isStreaming) return;
    const t = text;
    setText('');
    await send(t);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  if (variant === 'stage') {
    return (
      <div className="relative w-full rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] transition-all focus-within:border-warm/40 focus-within:shadow-[0_12px_48px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)]">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="描述你想写的论文 —— 主题、目标期刊、章节要求……"
          rows={3}
          className="w-full resize-none bg-transparent px-5 pt-5 pb-3 text-[14px] leading-relaxed focus:outline-none placeholder:text-muted-foreground/35 text-foreground/90"
          disabled={isStreaming}
        />
        <div className="flex items-center gap-2 px-3 pb-3">
          <PlusMenu />
          <TemplateSelector />
          <div className="flex-1" />
          <button
            onClick={isStreaming ? stop : submit}
            disabled={!isStreaming && !text.trim()}
            className="px-4 py-2 rounded-lg text-[12.5px] font-medium transition-all disabled:opacity-25 bg-warm text-warm-foreground hover:opacity-90 shadow-sm hover:shadow"
          >
            {isStreaming ? '■ 停止' : '开始写作 →'}
          </button>
        </div>
      </div>
    );
  }

  // chat variant
  return (
    <div className="relative w-full rounded-xl border border-border/40 bg-card/50 transition-all focus-within:border-warm/30 focus-within:ring-1 focus-within:ring-warm/20">
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="继续写作……"
        rows={2}
        className="w-full resize-none bg-transparent pl-[52px] pr-20 py-3 text-sm focus:outline-none placeholder:text-muted-foreground/30"
        disabled={isStreaming}
      />
      <div className="absolute left-2.5 bottom-2.5">
        <PlusMenu />
      </div>
      <button
        onClick={isStreaming ? stop : submit}
        disabled={!isStreaming && !text.trim()}
        className="absolute right-2.5 bottom-2.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-20 bg-warm text-warm-foreground hover:opacity-90 shadow-sm"
      >
        {isStreaming ? '■ 停止' : '发送 →'}
      </button>
    </div>
  );
}
