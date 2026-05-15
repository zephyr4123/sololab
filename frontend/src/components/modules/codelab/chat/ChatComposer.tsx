'use client';

/**
 * ChatComposer — the bottom input area.
 *
 * Owns:
 *   - the textarea input
 *   - SkillPicker activation (typing `/` opens the popover)
 *   - keyboard navigation through the popover (Arrow / Enter / Tab / Esc)
 *   - auto-resize and submit-on-Enter (Shift+Enter = newline)
 *   - status / cost / send-stop button row
 *
 * The component does not own the SSE stream — it calls `onSubmit(text)`
 * and `onStop()` callbacks. CodeLabChat owns the streaming lifecycle.
 *
 * Why this lives apart from CodeLabChat: keeping the composer's
 * keyboard state and skill-picker selection in one place makes it
 * trivial to swap in a richer editor later (Monaco, CodeMirror) — the
 * outer component only sees `onSubmit / isStreaming` and doesn't care.
 */

import { useEffect, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';
import { codelabSkillApi, type CodelabSkill } from '@/lib/api-client';
import { SkillPicker } from './SkillPicker';
import { getAgent } from '../shared/AgentMeta';

interface ChatComposerProps {
  isStreaming: boolean;
  agentStatus: 'idle' | 'thinking' | 'tool_call' | 'writing';
  currentAgent: string;
  costUsd: number;
  /** Pre-fill the textarea — incremented `tick` re-runs the effect even if `value` is identical (used by ChatEmptyState starter cards). */
  prefill?: { value: string; tick: number };
  onSubmit: (text: string) => void;
  onStop: () => void;
}

const STATUS_LABEL_ZH: Record<ChatComposerProps['agentStatus'], string> = {
  idle: '空闲',
  thinking: '思考中…',
  tool_call: '工作中…',
  writing: '生成中…',
};

export function ChatComposer({
  isStreaming, agentStatus, currentAgent, costUsd, prefill,
  onSubmit, onStop,
}: ChatComposerProps) {
  const [text, setText] = useState('');
  const [skills, setSkills] = useState<CodelabSkill[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIdx, setPickerIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch skill catalogue once
  useEffect(() => {
    codelabSkillApi.list().then(setSkills).catch(() => {});
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [text]);

  // Handle prefill from ChatEmptyState — tick forces re-run even on same value
  useEffect(() => {
    if (!prefill) return;
    setText(prefill.value);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }, [prefill]);

  // Derive picker visibility + filtered count for keyboard ranges
  const slashQuery = text.startsWith('/') && !text.includes(' ') ? text.slice(1) : null;
  const showPicker = pickerOpen && slashQuery !== null;
  const flatCount = showPicker
    ? skills.filter((s) => s.name.toLowerCase().includes(slashQuery.toLowerCase())).length
    : 0;

  const submit = () => {
    const v = text.trim();
    if (!v || isStreaming) return;
    setText('');
    setPickerOpen(false);
    onSubmit(v);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPicker && flatCount > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPickerIdx((i) => Math.min(i + 1, flatCount - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPickerIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        setPickerOpen(false);
        return;
      }
      // Enter / Tab handled implicitly — SkillPicker resolves the index
      // we hold here; we forward the picked skill below in `pickSkill`.
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const matching = skills
          .filter((s) => s.name.toLowerCase().includes(slashQuery!.toLowerCase()))
          .sort((a, b) => a.name.localeCompare(b.name));
        const pick = matching[pickerIdx];
        if (pick) pickSkill(pick);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const pickSkill = (skill: CodelabSkill) => {
    setText(`/${skill.name} `);
    setPickerOpen(false);
    setPickerIdx(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const onChange = (v: string) => {
    setText(v);
    const isSlash = v.startsWith('/') && !v.includes(' ');
    setPickerOpen(isSlash);
    setPickerIdx(0);
  };

  const agent = getAgent(currentAgent);

  return (
    <div className="relative shrink-0 px-6 pb-5 pt-3">
      <div className="relative">
        {showPicker && slashQuery !== null && (
          <SkillPicker
            skills={skills}
            query={slashQuery}
            activeIndex={pickerIdx}
            onPick={pickSkill}
            onHover={setPickerIdx}
          />
        )}

        <div className="rounded-2xl bg-card/65 backdrop-blur-sm shadow-[0_12px_60px_-24px_rgba(0,0,0,0.10)] transition-all focus-within:bg-card/85 focus-within:shadow-[0_20px_70px_-22px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_60px_-20px_rgba(0,0,0,0.45)]">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想做的事情，或输入 / 查看技能…"
            rows={1}
            disabled={isStreaming}
            className="w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[14px] leading-relaxed placeholder:text-muted-foreground/35 text-foreground/90 focus:outline-none max-h-[260px]"
            style={{ fontFamily: 'var(--font-sans)' }}
          />

          {/* Bottom bar — status left, button right */}
          <div className="flex items-center gap-3 px-4 pb-3 pt-1">
            <div
              className="text-[10.5px] text-muted-foreground/45 flex items-center gap-2"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {isStreaming ? (
                <>
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: agent.color,
                      animation: 'thinking-dot-bounce 1.4s ease-in-out infinite',
                    }}
                  />
                  <span style={{ color: agent.color }}>{agent.caps}</span>
                  <span className="text-muted-foreground/35">·</span>
                  <span>{STATUS_LABEL_ZH[agentStatus]}</span>
                </>
              ) : costUsd > 0 ? (
                <span>${costUsd.toFixed(4)}</span>
              ) : (
                <span className="text-muted-foreground/30">⏎ 发送 · ⇧⏎ 换行 · / 技能</span>
              )}
            </div>

            <div className="flex-1" />

            {isStreaming ? (
              <button
                onClick={onStop}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
                title="停止"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!text.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-warm px-3.5 py-1.5 text-[12.5px] font-medium text-warm-foreground transition-all disabled:opacity-25 hover:opacity-95 shadow-[0_4px_16px_-6px_rgba(184,149,106,0.45)]"
                title="发送 (Enter)"
              >
                发送
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
