'use client';

import { useMemo } from 'react';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useSessionStore } from '@/stores/session-store';
import { Loader2, CheckCircle, Circle, Globe, BookOpen, FileText } from 'lucide-react';

const PHASE_STEPS: Array<{ id: string; label: string }> = [
  { id: 'separate', label: '生成创意' },
  { id: 'cluster', label: '创意分组' },
  { id: 'together', label: '小组评议' },
  { id: 'synthesize', label: '整合最佳' },
  { id: 'evaluate', label: 'Elo 排序' },
];

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Web 搜索',
  arxiv_search: 'arXiv',
  scholar_search: 'Scholar',
  doc_parse: '文档解析',
};

const TOOL_ICONS: Record<string, typeof Globe> = {
  web_search: Globe,
  arxiv_search: BookOpen,
  scholar_search: BookOpen,
  doc_parse: FileText,
};

export function ProcessSidebar() {
  const { phase, currentRound, costUsd, ideas, topIdeas } = useIdeaSparkStore();
  const chatEntries = useSessionStore((s) => s.chatEntries);

  // 从最新一条 stream entry 里聚合工具调用计数
  const toolStats = useMemo(() => {
    const counts: Record<string, number> = {};
    let inflight = 0;
    let total = 0;

    // 找到最新的 stream entry（最近一次任务的事件流）
    let lastStream = null;
    for (let i = chatEntries.length - 1; i >= 0; i--) {
      if (chatEntries[i].kind === 'stream') {
        lastStream = chatEntries[i];
        break;
      }
    }
    if (!lastStream?.events) return { counts, inflight, total };

    for (const ev of lastStream.events) {
      if (ev.type === 'tool_call_started') {
        inflight += 1;
      } else if (ev.type === 'tool') {
        inflight = Math.max(0, inflight - 1);
        const name = ev.tool || 'unknown';
        counts[name] = (counts[name] || 0) + 1;
        total += 1;
      }
    }
    return { counts, inflight, total };
  }, [chatEntries]);

  const phaseIdx = PHASE_STEPS.findIndex((p) => p.id === phase);
  const isRunning = phase !== 'idle' && phase !== 'done' && phase !== 'converged';
  const isFinished = phase === 'done' || phase === 'converged';

  // Idle 状态不显示任何信息
  if (phase === 'idle' && ideas.length === 0 && toolStats.total === 0 && costUsd === 0) {
    return null;
  }

  return (
    <div className="space-y-5">
      {/* ── 流程进度 ── */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/45 mb-2">
          流程进度
          {currentRound > 0 && (
            <span className="ml-2 normal-case text-muted-foreground/35 tracking-normal">
              第 {currentRound} 轮
            </span>
          )}
        </p>
        <div className="space-y-1">
          {PHASE_STEPS.map((step, idx) => {
            const isCurrent = step.id === phase;
            const isCompleted = phaseIdx > idx || (isFinished && phaseIdx === -1);
            return (
              <div
                key={step.id}
                className={`flex items-center gap-2 px-1.5 py-1 rounded text-[11.5px] transition-colors ${
                  isCurrent ? 'bg-[var(--color-warm)]/10 text-foreground' : ''
                }`}
              >
                {isCurrent ? (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--color-warm)]/80" />
                ) : isCompleted ? (
                  <CheckCircle className="h-3 w-3 shrink-0 text-[var(--color-warm)]/55" />
                ) : (
                  <Circle className="h-3 w-3 shrink-0 text-muted-foreground/25" />
                )}
                <span
                  className={
                    isCurrent
                      ? 'text-foreground/80 font-medium'
                      : isCompleted
                        ? 'text-foreground/55'
                        : 'text-muted-foreground/35'
                  }
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 工具调用统计 ── */}
      {(toolStats.total > 0 || toolStats.inflight > 0) && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/45 mb-2">
            搜索工具
            {toolStats.inflight > 0 && (
              <span className="ml-2 normal-case text-[var(--color-warm)]/70 tracking-normal font-normal">
                · {toolStats.inflight} 进行中
              </span>
            )}
          </p>
          <div className="space-y-0.5">
            {Object.entries(toolStats.counts).map(([name, count]) => {
              const Icon = TOOL_ICONS[name] || BookOpen;
              const label = TOOL_LABELS[name] || name;
              return (
                <div key={name} className="flex items-center gap-2 px-1.5 py-0.5 text-[11px]">
                  <Icon className="h-3 w-3 shrink-0 text-muted-foreground/35" />
                  <span className="text-muted-foreground/65 flex-1 truncate">{label}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground/40 tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 创意 / 费用 ── */}
      {(ideas.length > 0 || topIdeas.length > 0 || costUsd > 0) && (
        <div className="border-t border-border/30 pt-4">
          {(ideas.length > 0 || topIdeas.length > 0) && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground/55 py-0.5">
              <span>{topIdeas.length > 0 ? 'Top 创意' : '候选创意'}</span>
              <span className="font-mono tabular-nums text-foreground/65">
                {topIdeas.length || ideas.length}
              </span>
            </div>
          )}
          {costUsd > 0 && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground/55 py-0.5">
              <span>已花费</span>
              <span className="font-mono tabular-nums text-[var(--color-warm)]">${costUsd.toFixed(4)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── 完成提示 ── */}
      {isFinished && topIdeas.length > 0 && (
        <div className="rounded-md border border-[var(--color-warm)]/25 bg-[var(--color-warm)]/[0.04] p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-warm)]">
            <CheckCircle className="h-3 w-3" />
            已完成
          </div>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground/55 leading-relaxed">
            前往「创意」标签查看 Top {topIdeas.length} 个创意的完整内容
          </p>
        </div>
      )}
    </div>
  );
}
