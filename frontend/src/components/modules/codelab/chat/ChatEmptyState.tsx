'use client';

/**
 * ChatEmptyState — shown inside the message column when a project is
 * selected but no conversation has begun. Replaces the legacy
 * "Bot + CodeLab" block, which read as a placeholder rather than a
 * starting line.
 *
 * Four starter prompts cover the most common entry verbs (explore /
 * test / fix / build). Each is rendered as a workshop tile with the
 * agent monogram that would naturally pick it up — so the user gets
 * a preview of the 4-agent vocabulary before they've even started.
 *
 * Picking a suggestion pre-fills the composer rather than dispatching
 * immediately — users almost always want to add context ("...in
 * tests/" or "...for the auth flow") before hitting send.
 */

import { AGENTS, type AgentId } from '../shared/AgentMeta';

interface Starter {
  agent: AgentId;
  title: string;
  prompt: string;
  helper: string;
}

const STARTERS: Starter[] = [
  {
    agent: 'explore',
    title: '探索项目结构',
    prompt: '帮我读一下这个项目的目录结构，告诉我入口在哪、核心模块是哪几个，挑出最值得关注的 3 个文件给我看。',
    helper: 'read · grep · glob',
  },
  {
    agent: 'plan',
    title: '规划一个新功能',
    prompt: '我想加一个新功能：',
    helper: 'plan · design · spec',
  },
  {
    agent: 'build',
    title: '实现一个修复',
    prompt: '修一个 bug：',
    helper: 'edit · write · bash',
  },
  {
    agent: 'general',
    title: '跑测试',
    prompt: '帮我跑一下测试套件，把失败的项分类总结给我。',
    helper: 'bash · test',
  },
];

interface ChatEmptyStateProps {
  onPickPrompt: (prompt: string) => void;
}

export function ChatEmptyState({ onPickPrompt }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-10 text-center">
      <span
        className="atelier-eyebrow mb-5 animate-fade-in-up"
        style={{ animationDelay: '60ms' }}
      >
        ready · workshop floor
      </span>

      <h2
        className="text-[clamp(22px,3vw,30px)] leading-[1.2] tracking-[-0.018em] text-foreground/90 mb-3 animate-fade-in-up"
        style={{ animationDelay: '120ms', fontFamily: 'var(--font-display)' }}
      >
        从一个想法开始。
      </h2>

      <p
        className="text-[12.5px] tracking-wide text-muted-foreground/60 mb-9 max-w-[480px] animate-fade-in-up"
        style={{ animationDelay: '180ms' }}
      >
        描述你想做的事情，4 个工匠会分工接力 —— 探索读码、规划方案、执行改动、验证结果。
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-[640px]">
        {STARTERS.map((s, i) => {
          const meta = AGENTS[s.agent];
          return (
            <button
              key={s.title}
              onClick={() => onPickPrompt(s.prompt)}
              className="codelab-card text-left animate-fade-in-up group"
              style={{ animationDelay: `${240 + i * 60}ms` }}
            >
              <div className="flex items-baseline gap-2 mb-1.5">
                <span
                  className="text-[14px] leading-none"
                  style={{ fontFamily: 'var(--font-display)', color: meta.color, opacity: 0.85 }}
                >
                  {meta.monogram}
                </span>
                <span
                  className="text-[9.5px] uppercase tracking-[0.22em] font-semibold"
                  style={{ color: meta.color, opacity: 0.85 }}
                >
                  {meta.caps}
                </span>
              </div>
              <p
                className="text-[13px] text-foreground/85 mb-1.5 leading-snug"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {s.title}
              </p>
              <p
                className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground/40"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {s.helper}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
