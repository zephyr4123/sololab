'use client';

import { useState, useMemo, useEffect, memo } from 'react';
import {
  Sparkles, Search, MessageSquare, Brain, Scale, Bot,
  Globe, BookOpen, FileText, CheckCircle, AlertTriangle,
  ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';

interface StreamEvent {
  type: string;
  [key: string]: any;
}

// ─── Constants ───────────────────────────────────────────────

const PHASE_META: Record<string, { label: string; description: string }> = {
  separate:   { label: '生成创意',   description: '发散者和领域专家各自独立提出创意' },
  cluster:    { label: '创意分组',   description: '按相似度把创意归类' },
  together:   { label: '小组评议',   description: '审辩者指出问题，整合者给出改进' },
  synthesize: { label: '整合最佳',   description: '汇总各组的优秀创意，去重补强' },
  evaluate:   { label: 'Elo 排序',   description: '成对比较，选出 Top 创意' },
  converged:  { label: '已完成',     description: 'Top 创意已确定' },
};

const PHASE_ORDER = ['separate', 'cluster', 'together', 'synthesize', 'evaluate'];

const AGENT_NAMES: Record<string, string> = {
  divergent: '发散者', expert: '领域专家', critic: '审辩者',
  connector: '整合者', evaluator: '评审者',
};

const AGENT_ICONS: Record<string, typeof Brain> = {
  divergent: Sparkles, expert: Search, critic: MessageSquare,
  connector: Brain, evaluator: Scale,
};

const AGENT_ACCENT_DOT: Record<string, string> = {
  divergent: 'bg-purple-400',
  expert: 'bg-blue-400',
  critic: 'bg-red-400',
  connector: 'bg-green-400',
  evaluator: 'bg-amber-400',
};

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Web 搜索',
  arxiv_search: 'arXiv 论文搜索',
  scholar_search: 'Scholar 学术搜索',
  doc_parse: '文档解析',
};

const TOOL_ICONS: Record<string, typeof Globe> = {
  web_search: Globe,
  arxiv_search: BookOpen,
  scholar_search: BookOpen,
  doc_parse: FileText,
};

// ─── Phase grouping logic ────────────────────────────────────

interface PhaseGroup {
  phase: string;
  round: number;
  meta: { ideaCount?: number; groupCount?: number; candidateCount?: number };
  events: StreamEvent[];
}

function groupEventsByPhase(events: StreamEvent[]): {
  rounds: Map<number, PhaseGroup[]>;
  currentPhase: string;
  currentRound: number;
  isDone: boolean;
} {
  const rounds = new Map<number, PhaseGroup[]>();
  let currentPhase = '';
  let currentRound = 1;
  let currentGroup: PhaseGroup | null = null;
  let isDone = false;

  for (const event of events) {
    if (event.type === 'done') {
      isDone = true;
      continue;
    }
    if (event.type === 'status') {
      currentPhase = event.phase || '';
      if (event.round) currentRound = event.round;

      if (!rounds.has(currentRound)) rounds.set(currentRound, []);
      const roundPhases = rounds.get(currentRound)!;

      currentGroup = {
        phase: currentPhase,
        round: currentRound,
        meta: {
          ideaCount: event.idea_count,
          groupCount: event.group_count,
          candidateCount: event.candidate_count,
        },
        events: [],
      };
      roundPhases.push(currentGroup);
      continue;
    }

    if (event.type === 'error' || event.type === 'task_created' || event.type === 'doc_context') {
      continue;
    }

    if (currentGroup) {
      currentGroup.events.push(event);
    }
  }

  return { rounds, currentPhase, currentRound, isDone };
}

// ─── PipelineView Component ──────────────────────────────────

interface PipelineViewProps {
  events: StreamEvent[];
}

export const PipelineView = memo(function PipelineView({ events }: PipelineViewProps) {
  const { rounds, currentPhase, currentRound, isDone } = useMemo(() => groupEventsByPhase(events), [events]);

  const doneEvent = events.find(e => e.type === 'done');
  const errorEvent = events.find(e => e.type === 'error');
  const docContextEvent = events.find(e => e.type === 'doc_context');

  if (events.length === 0) return null;

  return (
    <div className="space-y-3">
      {docContextEvent && <DocContextSection event={docContextEvent} />}
      {Array.from(rounds.entries()).map(([roundNum, phases]) => (
        <RoundSection
          key={roundNum}
          roundNum={roundNum}
          phases={phases}
          currentPhase={roundNum === currentRound ? currentPhase : ''}
          isCurrentRound={roundNum === currentRound && !isDone}
          isDone={isDone}
        />
      ))}

      {doneEvent && <DoneSection event={doneEvent} />}
      {errorEvent && <ErrorSection event={errorEvent} />}
    </div>
  );
});

// ─── Round Section ───────────────────────────────────────────

function RoundSection({ roundNum, phases, currentPhase, isCurrentRound, isDone }: {
  roundNum: number;
  phases: PhaseGroup[];
  currentPhase: string;
  isCurrentRound: boolean;
  isDone: boolean;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
          第 {roundNum} 轮
        </div>
        <div className="h-px flex-1 bg-border/40" />
      </div>

      <ProgressBar phases={phases} currentPhase={currentPhase} isActive={isCurrentRound} />

      {phases.map((group, idx) => {
        const isPhaseActive = isCurrentRound && group.phase === currentPhase;
        return (
          <PhaseSection
            key={`${group.phase}-${idx}`}
            group={group}
            isActive={isPhaseActive}
            isDone={isDone}
          />
        );
      })}
    </div>
  );
}

// ─── Progress Bar ────────────────────────────────────────────

function ProgressBar({ phases, currentPhase, isActive }: {
  phases: PhaseGroup[];
  currentPhase: string;
  isActive: boolean;
}) {
  const completedPhases = new Set(phases.map(p => p.phase));

  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted/20 px-2.5 py-1.5">
      {PHASE_ORDER.map((phase, idx) => {
        const isCompleted = completedPhases.has(phase) && phase !== currentPhase;
        const isCurrent = isActive && phase === currentPhase;
        const meta = PHASE_META[phase];

        return (
          <div key={phase} className="flex items-center gap-1">
            {idx > 0 && (
              <div
                className={`h-px w-3 ${
                  isCompleted || isCurrent ? 'bg-[var(--color-warm)]/40' : 'bg-border/50'
                }`}
              />
            )}
            <div
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium transition-all ${
                isCurrent
                  ? 'bg-[var(--color-warm)]/15 text-[var(--color-warm)]'
                  : isCompleted
                    ? 'text-foreground/55'
                    : 'text-muted-foreground/30'
              }`}
              title={meta?.description}
            >
              {isCurrent && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              {isCompleted && <CheckCircle className="h-2.5 w-2.5" />}
              {meta?.label || phase}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Phase Section ───────────────────────────────────────────

function PhaseSection({ group, isActive, isDone }: { group: PhaseGroup; isActive: boolean; isDone: boolean }) {
  // 默认折叠：done 后全部折叠；只展开当前活跃阶段
  const [expanded, setExpanded] = useState(isActive);

  // 当 phase 状态变化时自动调整折叠状态
  useEffect(() => {
    if (isActive) setExpanded(true);
    else if (isDone) setExpanded(false);
  }, [isActive, isDone]);

  const meta = PHASE_META[group.phase];
  const ideaCount = group.events.filter(e => e.type === 'idea').length;
  const toolCount = group.events.filter(e => e.type === 'tool').length;

  return (
    <div
      className={`rounded-lg border transition-all ${
        isActive ? 'border-[var(--color-warm)]/30 bg-[var(--color-warm)]/[0.02]' : 'border-border/40'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-foreground/[0.02] transition-colors"
      >
        {expanded
          ? <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
          : <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
        <span className="text-[12.5px] font-medium text-foreground/80">
          {meta?.label || group.phase}
        </span>
        <span className="text-[11px] text-muted-foreground/50">
          {meta?.description}
        </span>

        {/* Inline meta badges */}
        <div className="ml-auto flex items-center gap-1.5">
          {group.meta.ideaCount != null && (
            <span className="text-[10px] text-muted-foreground/45 tabular-nums">
              {group.meta.ideaCount} 创意
            </span>
          )}
          {group.meta.groupCount != null && (
            <span className="text-[10px] text-muted-foreground/45 tabular-nums">
              {group.meta.groupCount} 组
            </span>
          )}
          {group.meta.candidateCount != null && (
            <span className="text-[10px] text-muted-foreground/45 tabular-nums">
              {group.meta.candidateCount} 候选
            </span>
          )}
          {toolCount > 0 && !group.meta.ideaCount && (
            <span className="text-[10px] text-muted-foreground/30 tabular-nums">
              {toolCount} 次搜索
            </span>
          )}
          {isActive && <Loader2 className="h-3 w-3 animate-spin text-[var(--color-warm)]/70" />}
        </div>
      </button>

      {expanded && group.events.length > 0 && (
        <div className="border-t border-border/30 px-3 py-2">
          {group.phase === 'separate' && <SeparatePhaseView events={group.events} />}
          {group.phase === 'cluster' && <ClusterPhaseView events={group.events} />}
          {group.phase === 'together' && <TogetherPhaseView events={group.events} />}
          {group.phase === 'synthesize' && <SynthesizePhaseView events={group.events} />}
          {group.phase === 'evaluate' && <EvaluatePhaseView events={group.events} />}
          {!['separate', 'cluster', 'together', 'synthesize', 'evaluate'].includes(group.phase) && (
            <GenericPhaseView events={group.events} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Separate Phase: side-by-side agents ─────────────────────

function SeparatePhaseView({ events }: { events: StreamEvent[] }) {
  const agentEvents: Record<string, StreamEvent[]> = {};
  for (const e of events) {
    const agent = e.agent || e.author || 'unknown';
    if (!agentEvents[agent]) agentEvents[agent] = [];
    agentEvents[agent].push(e);
  }

  const agents = Object.keys(agentEvents);

  return (
    <div className={`grid gap-2 ${agents.length >= 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
      {agents.map(agent => (
        <AgentColumn key={agent} agent={agent} events={agentEvents[agent]} />
      ))}
    </div>
  );
}

function AgentColumn({ agent, events }: { agent: string; events: StreamEvent[] }) {
  const Icon = AGENT_ICONS[agent] || Bot;
  const dotClass = AGENT_ACCENT_DOT[agent] || 'bg-gray-400';

  const toolEvents = aggregateToolEvents(events);
  const ideas = events.filter(e => e.type === 'idea');
  const doneEvent = events.find(e => e.type === 'agent' && e.action === 'done');

  // 流式正文增量：作为 "live preview"（装饰化）
  const streamingContent = useMemo(
    () =>
      events
        .filter(e => e.type === 'agent_content_delta')
        .map(e => e.delta || '')
        .join(''),
    [events]
  );
  const showStreaming = streamingContent.length > 0 && ideas.length === 0;

  return (
    <div className="rounded-md border border-border/40 bg-background/50 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <Icon className="h-3 w-3 text-muted-foreground/55" />
        <span className="text-foreground/70">{AGENT_NAMES[agent] || agent}</span>
        {doneEvent && <CheckCircle className="ml-auto h-3 w-3 text-[var(--color-warm)]/50" />}
      </div>

      {/* Tool calls (薄行) */}
      {toolEvents.length > 0 && (
        <div className="space-y-0.5">
          {toolEvents.map((t, i) => <ToolCallRow key={i} event={t} />)}
        </div>
      )}

      {/* 流式预览 — 装饰化（italic + 低对比度，类似思考流） */}
      {showStreaming && (
        <div className="text-[12px] italic text-muted-foreground/55 leading-[1.65] line-clamp-6">
          {streamingContent}
          <span className="ml-1 inline-block h-2.5 w-1 align-middle bg-[var(--color-warm)]/40 animate-pulse" />
        </div>
      )}

      {/* 最终创意 */}
      {ideas.map((idea, i) => (
        <div key={i} className="rounded-sm bg-foreground/[0.02] p-2 border-l-2 border-[var(--color-warm)]/30">
          <MarkdownViewer content={idea.content} compact />
        </div>
      ))}
    </div>
  );
}

// ─── Cluster Phase ───────────────────────────────────────────

function ClusterPhaseView({ events }: { events: StreamEvent[] }) {
  return (
    <div className="text-center text-[11.5px] text-muted-foreground/60 py-1">
      创意已按相似度完成分组
    </div>
  );
}

// ─── Together Phase: grouped discussion ──────────────────────
// 用 e.group_idx + e.iteration 字段精准分组，避免多组并行时事件交错归错组

function TogetherPhaseView({ events }: { events: StreamEvent[] }) {
  // Step 1: 按 group_idx 分组（没字段的归 -1 = 兜底）
  const groupMap = new Map<number, StreamEvent[]>();
  for (const e of events) {
    const g = typeof e.group_idx === 'number' ? e.group_idx : -1;
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g)!.push(e);
  }

  // Step 2: group_idx 升序，default (-1) 放最后
  const sortedGroups = Array.from(groupMap.entries()).sort((a, b) => {
    if (a[0] === -1) return 1;
    if (b[0] === -1) return -1;
    return a[0] - b[0];
  });

  return (
    <div className="space-y-2">
      {sortedGroups.map(([groupIdx, groupEvents]) => (
        <GroupBlock key={groupIdx} groupIdx={groupIdx} events={groupEvents} />
      ))}
    </div>
  );
}

function GroupBlock({ groupIdx, events }: { groupIdx: number; events: StreamEvent[] }) {
  // 按 iteration 拆分子轮次（每个 iteration 一个完整的 critic + connector 轮次）
  const iterMap = new Map<number, StreamEvent[]>();
  for (const e of events) {
    const it = typeof e.iteration === 'number' ? e.iteration : 0;
    if (!iterMap.has(it)) iterMap.set(it, []);
    iterMap.get(it)!.push(e);
  }
  const sortedIters = Array.from(iterMap.entries()).sort((a, b) => a[0] - b[0]);
  const groupLabel = groupIdx === -1 ? '小组讨论' : `第 ${groupIdx + 1} 组`;

  return (
    <div className="rounded-md border border-dashed border-border/50 p-2 space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground/70">
        {groupLabel}
        {sortedIters.length > 1 && (
          <span className="ml-2 text-[10px] text-muted-foreground/40">
            · {sortedIters.length} 轮迭代
          </span>
        )}
      </div>
      {sortedIters.map(([iter, iterEvents]) => (
        <IterationBlock
          key={iter}
          iter={iter}
          events={iterEvents}
          showIterLabel={sortedIters.length > 1}
        />
      ))}
    </div>
  );
}

function IterationBlock({
  iter, events, showIterLabel,
}: { iter: number; events: StreamEvent[]; showIterLabel: boolean }) {
  const allTools = aggregateToolEvents(events);
  const criticTools = allTools.filter(t => t.agent === 'critic');
  const connectorTools = allTools.filter(t => t.agent === 'connector');

  const critiques = events.filter(e => e.type === 'agent' && e.action === 'critique');
  const syntheses = events.filter(e => e.type === 'agent' && e.action === 'synthesis');

  const criticStreaming = events
    .filter(e => e.type === 'agent_content_delta' && e.agent === 'critic')
    .map(e => e.delta || '').join('');
  const connectorStreaming = events
    .filter(e => e.type === 'agent_content_delta' && e.agent === 'connector')
    .map(e => e.delta || '').join('');
  const showCriticStreaming = criticStreaming.length > 0 && critiques.length === 0;
  const showConnectorStreaming = connectorStreaming.length > 0 && syntheses.length === 0;

  return (
    <div className="space-y-1.5">
      {showIterLabel && (
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/45">
          第 {iter + 1} 轮
        </div>
      )}

      {/* 审辩者工具 + 输出 */}
      {criticTools.length > 0 && (
        <div className="space-y-0.5">
          {criticTools.map((t, i) => <ToolCallRow key={`ct-${i}`} event={t} />)}
        </div>
      )}
      {showCriticStreaming ? (
        <div className="rounded-sm bg-red-50/40 dark:bg-red-950/15 p-1.5 border-l-2 border-red-300/40">
          <div className="mb-0.5 flex items-center gap-1 text-[10.5px] text-red-700/70 dark:text-red-400/70">
            <MessageSquare className="h-2.5 w-2.5" />
            审辩者正在指出问题
          </div>
          <div className="text-[12px] italic text-red-800/55 dark:text-red-300/55 leading-[1.65] line-clamp-4">
            {criticStreaming}
          </div>
        </div>
      ) : critiques.length > 0 ? (
        critiques.map((c, i) => (
          <div key={`c-${i}`} className="rounded-sm bg-red-50/40 dark:bg-red-950/15 p-2 border-l-2 border-red-300/50">
            <div className="mb-1 flex items-center gap-1 text-[10.5px] font-medium text-red-700/80 dark:text-red-400/80">
              <MessageSquare className="h-2.5 w-2.5" />
              审辩者
            </div>
            <MarkdownViewer content={c.content} compact />
          </div>
        ))
      ) : null}

      {/* 整合者工具 + 输出 */}
      {connectorTools.length > 0 && (
        <div className="space-y-0.5">
          {connectorTools.map((t, i) => <ToolCallRow key={`nt-${i}`} event={t} />)}
        </div>
      )}
      {showConnectorStreaming ? (
        <div className="rounded-sm bg-green-50/40 dark:bg-green-950/15 p-1.5 border-l-2 border-green-300/40">
          <div className="mb-0.5 flex items-center gap-1 text-[10.5px] text-green-700/70 dark:text-green-400/70">
            <Brain className="h-2.5 w-2.5" />
            整合者正在改进
          </div>
          <div className="text-[12px] italic text-green-800/55 dark:text-green-300/55 leading-[1.65] line-clamp-4">
            {connectorStreaming}
          </div>
        </div>
      ) : syntheses.length > 0 ? (
        syntheses.map((s, i) => (
          <div key={`s-${i}`} className="rounded-sm bg-green-50/40 dark:bg-green-950/15 p-2 border-l-2 border-green-300/50">
            <div className="mb-1 flex items-center gap-1 text-[10.5px] font-medium text-green-700/80 dark:text-green-400/80">
              <Brain className="h-2.5 w-2.5" />
              整合者
            </div>
            <MarkdownViewer content={s.content} compact />
          </div>
        ))
      ) : null}
    </div>
  );
}

// ─── Synthesize Phase ────────────────────────────────────────

function SynthesizePhaseView({ events }: { events: StreamEvent[] }) {
  const syntheses = events.filter(e => e.type === 'agent' && e.content);

  return (
    <div className="space-y-1.5">
      {syntheses.map((s, i) => (
        <div key={i} className="rounded-sm bg-green-50/30 dark:bg-green-950/15 p-2 border-l-2 border-green-300/50">
          <div className="mb-1 flex items-center gap-1 text-[10.5px] font-medium text-green-700/80 dark:text-green-400/80">
            <Brain className="h-2.5 w-2.5" />
            整合者综合各组创意
          </div>
          <MarkdownViewer content={s.content} compact />
        </div>
      ))}
      {syntheses.length === 0 && (
        <div className="text-center text-[11.5px] text-muted-foreground/60 py-1">
          <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
          正在汇总各组的最佳创意...
        </div>
      )}
    </div>
  );
}

// ─── Evaluate Phase: tournament ranking ──────────────────────

function EvaluatePhaseView({ events }: { events: StreamEvent[] }) {
  const votes = events.filter(e => e.type === 'vote').sort((a, b) => (a.rank || 99) - (b.rank || 99));

  if (votes.length === 0) {
    return (
      <div className="text-center text-[11.5px] text-muted-foreground/60 py-1">
        <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
        正在对创意进行最终排序...
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {votes.map((v, i) => {
        const isTop = i === 0;
        return (
          <div
            key={i}
            className={`rounded-sm p-2 border-l-2 ${
              isTop
                ? 'border-[var(--color-warm)]/60 bg-[var(--color-warm)]/[0.04]'
                : 'border-border/40 bg-foreground/[0.01]'
            }`}
          >
            <div className="mb-1 flex items-center gap-1.5 text-[11px]">
              <span className={`font-bold ${isTop ? 'text-[var(--color-warm)]' : 'text-muted-foreground/55'}`}>
                #{v.rank}
              </span>
              <span className="text-muted-foreground/55">
                {AGENT_NAMES[v.author] || v.author}
              </span>
              <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/45">
                Elo {v.elo_score}
              </span>
            </div>
            <MarkdownViewer content={v.content} compact />
          </div>
        );
      })}
    </div>
  );
}

// ─── Generic fallback ────────────────────────────────────────

function GenericPhaseView({ events }: { events: StreamEvent[] }) {
  return (
    <div className="space-y-1.5">
      {events.filter(e => e.content).map((e, i) => (
        <div key={i} className="rounded-sm border border-border/40 p-2 text-[12.5px]">
          <MarkdownViewer content={e.content} compact />
        </div>
      ))}
    </div>
  );
}

// ─── Tool Call Aggregator + Row (CodeLab-style 薄行) ─────────

interface AggregatedTool {
  agent?: string;
  tool: string;
  query?: string;
  status: 'running' | 'completed' | 'error';
  success?: boolean;
  result_count?: number;
  results?: Array<{ title: string; url: string; snippet: string }>;
  error?: string | null;
}

/** 把 tool_call_started + tool 事件聚合成一个工具调用记录。 */
function aggregateToolEvents(events: StreamEvent[]): AggregatedTool[] {
  const result: AggregatedTool[] = [];
  const inflightByAgentTool = new Map<string, number>(); // key -> index in result

  for (const e of events) {
    if (e.type === 'tool_call_started') {
      const key = `${e.agent || ''}:${e.tool || ''}`;
      const idx = result.length;
      result.push({
        agent: e.agent,
        tool: e.tool,
        query: e.query,
        status: 'running',
      });
      inflightByAgentTool.set(key, idx);
    } else if (e.type === 'tool') {
      const key = `${e.agent || ''}:${e.tool || ''}`;
      const idx = inflightByAgentTool.get(key);
      if (idx != null) {
        result[idx] = {
          agent: e.agent,
          tool: e.tool,
          query: e.query || result[idx].query,
          status: e.success === false ? 'error' : 'completed',
          success: e.success,
          result_count: e.result_count,
          results: e.results,
          error: e.error,
        };
        inflightByAgentTool.delete(key);
      } else {
        // 没有配对的 started 事件（旧数据兼容）：直接显示完成态
        result.push({
          agent: e.agent,
          tool: e.tool,
          query: e.query,
          status: e.success === false ? 'error' : 'completed',
          success: e.success,
          result_count: e.result_count,
          results: e.results,
          error: e.error,
        });
      }
    }
  }

  return result;
}

function ToolCallRow({ event }: { event: AggregatedTool }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[event.tool] || BookOpen;
  const label = TOOL_LABELS[event.tool] || event.tool;
  const isRunning = event.status === 'running';
  const isError = event.status === 'error';
  const hasResults = (event.results?.length ?? 0) > 0 || !!event.error;

  const borderClass = isRunning
    ? 'border-l-[var(--color-warm)]/60'
    : isError
      ? 'border-l-red-300/50'
      : 'border-l-border/30';

  return (
    <div
      className={`border-l-2 ${borderClass} pl-2 ${isRunning ? 'tool-call-active' : ''}`}
    >
      <div
        className={`flex items-center gap-1.5 py-0.5 text-[11px] ${
          hasResults ? 'cursor-pointer hover:bg-foreground/[0.02]' : ''
        }`}
        onClick={hasResults ? () => setExpanded(!expanded) : undefined}
      >
        {isRunning ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--color-warm)]/70" />
        ) : isError ? (
          <AlertTriangle className="h-3 w-3 shrink-0 text-red-400/70" />
        ) : (
          <Icon className="h-3 w-3 shrink-0 text-muted-foreground/35" />
        )}
        <span className="text-[10.5px] text-muted-foreground/45 shrink-0 tracking-wide">
          {label}
        </span>
        <span className="truncate text-[11px] text-foreground/55 font-mono tracking-tight">
          {event.query || (isRunning ? '准备中...' : '')}
        </span>
        {!isRunning && event.result_count != null && event.result_count > 0 && (
          <span className="text-[10px] text-muted-foreground/30 shrink-0 tabular-nums ml-auto">
            {event.result_count} 条
          </span>
        )}
        {hasResults && (
          <ChevronRight
            className={`h-2.5 w-2.5 shrink-0 text-muted-foreground/25 transition-transform duration-200 ${
              expanded ? 'rotate-90' : ''
            } ${event.result_count == null ? 'ml-auto' : ''}`}
          />
        )}
      </div>

      {expanded && (event.results?.length ?? 0) > 0 && (
        <div className="mb-1 ml-1 space-y-0.5 border-l border-border/20 pl-2">
          {event.results!.slice(0, 5).map((r, i) => (
            <div key={i} className="text-[10.5px] leading-snug">
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/55 hover:text-[var(--color-warm)] hover:underline line-clamp-1"
                >
                  {i + 1}. {r.title || r.url}
                </a>
              ) : (
                <span className="text-foreground/55 line-clamp-1">
                  {i + 1}. {r.title}
                </span>
              )}
              {r.snippet && (
                <p className="text-muted-foreground/35 line-clamp-1 ml-3">{r.snippet}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && event.error && (
        <div className="mb-1 ml-1 pl-2 text-[10.5px] text-red-500/70 border-l border-red-300/30">
          {event.error}
        </div>
      )}
    </div>
  );
}

// ─── Document Context Section ────────────────────────────────

function DocContextSection({ event }: { event: StreamEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground/65"
      >
        <FileText className="h-3 w-3" />
        <span>已加载参考文献</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground/45">{event.chunk_count || 0} 段相关内容</span>
        {expanded
          ? <ChevronDown className="ml-auto h-2.5 w-2.5" />
          : <ChevronRight className="ml-auto h-2.5 w-2.5" />}
      </button>
      {expanded && event.preview && (
        <div className="mt-1.5 rounded-sm bg-foreground/[0.02] p-2 text-[11px] text-muted-foreground/65 whitespace-pre-wrap line-clamp-6">
          {event.preview}
        </div>
      )}
    </div>
  );
}

// ─── Done / Error Sections ───────────────────────────────────

function DoneSection({ event }: { event: StreamEvent }) {
  const count = event.top_ideas?.length || 0;
  return (
    <div className="rounded-lg border border-[var(--color-warm)]/30 bg-[var(--color-warm)]/[0.04] p-3">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-[var(--color-warm)]" />
        <p className="text-[13px] font-medium text-foreground/85">
          已生成 {count} 个 Top 创意
        </p>
        {event.cost_usd > 0 && (
          <span className="ml-auto text-[11px] text-muted-foreground/60 font-mono tabular-nums">
            ${event.cost_usd}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground/65">
        切换到顶部「创意」标签页查看完整内容，或在「报告」标签页导出。
      </p>
    </div>
  );
}

function ErrorSection({ event }: { event: StreamEvent }) {
  return (
    <div className="rounded-lg border border-red-300/40 bg-red-50/30 dark:bg-red-950/15 p-3">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-red-700/85 dark:text-red-400/85">
        <AlertTriangle className="h-3.5 w-3.5" />
        生成失败
      </div>
      <p className="mt-1 text-[12px] text-red-600/75 dark:text-red-400/75">
        {event.message || event.error || 'Unknown error'}
      </p>
    </div>
  );
}
