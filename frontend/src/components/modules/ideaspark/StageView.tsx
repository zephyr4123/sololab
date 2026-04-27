'use client';

/**
 * StageView —— IdeaSpark 主舞台。
 *
 * 设计哲学：Timeline + 实时流式
 *   - 顶部 5 圆点进度 + Round + 数字摘要
 *   - 每个 phase 一行，已完成自动折叠成单行摘要，当前 phase 展开
 *   - 当前 agent 流式 markdown 实时累加渲染（边生成边看）
 *   - 工具调用极简化薄行（CodeLab 同款）
 *   - 完成后切到 ResultStage：Top 3 大卡片主舞台
 *
 * 不再依赖 PipelineView —— StageView 自己渲染所有过程详情。
 */

import { useMemo, useState, useEffect } from 'react';
import {
  Sparkles, Search, MessageSquare, Brain, Scale, Bot, Trophy,
  ChevronDown, ChevronRight, AlertTriangle, DollarSign,
  CheckCircle2, Loader2, Globe, BookOpen, FileText, Layers,
  ArrowRight, History,
} from 'lucide-react';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

// ─── Types ─────────────────────────────────────────────────────

interface StreamEvent {
  type: string;
  [key: string]: any;
}

type PhaseId =
  | 'separate' | 'cluster' | 'together' | 'synthesize' | 'evaluate'
  | 'converged' | 'done' | 'cancelled';

const PHASE_ORDER: PhaseId[] = ['separate', 'cluster', 'together', 'synthesize', 'evaluate'];

const PHASE_LABEL: Record<PhaseId, string> = {
  separate: '生成创意',
  cluster: '创意分组',
  together: '小组评议',
  synthesize: '整合最佳',
  evaluate: 'Elo 排序',
  converged: '已完成',
  done: '已完成',
  cancelled: '已取消',
};

const AGENT_NAMES: Record<string, string> = {
  divergent: '发散者',
  expert: '领域专家',
  critic: '审辩者',
  connector: '整合者',
  evaluator: '评审者',
};

const AGENT_ICON: Record<string, typeof Brain> = {
  divergent: Sparkles,
  expert: Search,
  critic: MessageSquare,
  connector: Brain,
  evaluator: Scale,
};

const AGENT_TONE: Record<string, { dot: string; text: string; bg: string }> = {
  divergent: { dot: 'bg-purple-400/70', text: 'text-purple-700/75 dark:text-purple-300/75', bg: 'bg-purple-50/35 dark:bg-purple-950/15' },
  expert: { dot: 'bg-blue-400/70', text: 'text-blue-700/75 dark:text-blue-300/75', bg: 'bg-blue-50/35 dark:bg-blue-950/15' },
  critic: { dot: 'bg-rose-400/70', text: 'text-rose-700/75 dark:text-rose-300/75', bg: 'bg-rose-50/35 dark:bg-rose-950/15' },
  connector: { dot: 'bg-emerald-400/70', text: 'text-emerald-700/75 dark:text-emerald-300/75', bg: 'bg-emerald-50/35 dark:bg-emerald-950/15' },
  evaluator: { dot: 'bg-amber-400/70', text: 'text-amber-700/75 dark:text-amber-300/75', bg: 'bg-amber-50/35 dark:bg-amber-950/15' },
};

// ─── State derivation ──────────────────────────────────────────

interface TopIdea {
  id: string;
  content: string;
  author: string;
  elo_score: number;
}

interface ProcessSnapshot {
  kind: 'process';
  phase: PhaseId;
  phaseIdx: number;
  round: number;
  toolDone: number;
  toolInflight: number;
  paperCount: number;
  ideaCount: number;
  isLive: boolean;
}

interface DoneSnapshot {
  kind: 'done';
  topIdeas: TopIdea[];
  costUsd: number;
  toolDone: number;
  paperCount: number;
  ideaCount: number;
}

interface ErrorSnapshot {
  kind: 'error';
  message: string;
}

interface IdleSnapshot {
  kind: 'idle';
}

type StageState = ProcessSnapshot | DoneSnapshot | ErrorSnapshot | IdleSnapshot;

function deriveStage(events: StreamEvent[]): StageState {
  if (events.length === 0) return { kind: 'idle' };

  // 倒序找终止事件
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === 'error') {
      return { kind: 'error', message: ev.message || ev.error || '未知错误' };
    }
    if (ev.type === 'done') {
      const top: TopIdea[] = (ev.top_ideas || []) as TopIdea[];
      const toolDone = events.filter(e => e.type === 'tool').length;
      const paperCount = events
        .filter(e => e.type === 'tool' && typeof e.result_count === 'number')
        .reduce((s, e) => s + (e.result_count || 0), 0);
      const ideaCount = events.filter(e => e.type === 'idea').length;
      return { kind: 'done', topIdeas: top, costUsd: ev.cost_usd || 0, toolDone, paperCount, ideaCount };
    }
  }

  let phase: PhaseId = 'separate';
  let round = 1;
  for (const ev of events) {
    if (ev.type === 'status') {
      if (ev.phase) phase = ev.phase as PhaseId;
      if (typeof ev.round === 'number') round = ev.round;
    }
  }

  const toolStartedEvents = events.filter(e => e.type === 'tool_call_started');
  const toolDoneEvents = events.filter(e => e.type === 'tool');
  const toolInflight = Math.max(0, toolStartedEvents.length - toolDoneEvents.length);
  const toolDone = toolDoneEvents.length;
  const paperCount = toolDoneEvents
    .filter(e => typeof e.result_count === 'number')
    .reduce((s, e) => s + (e.result_count || 0), 0);
  const ideaCount = events.filter(e => e.type === 'idea').length;

  // 是否还在流式生成（最近 30 个事件里有 content/reasoning delta）
  const tail = events.slice(-30);
  const isLive = tail.some(
    e => e.type === 'agent_content_delta' || e.type === 'agent_reasoning_delta'
  ) || toolInflight > 0;

  const phaseIdx = PHASE_ORDER.indexOf(phase as any);

  return { kind: 'process', phase, phaseIdx, round, toolDone, toolInflight, paperCount, ideaCount, isLive };
}

export function useStageState(events: StreamEvent[]): StageState {
  return useMemo(() => deriveStage(events), [events]);
}

// ─── Phase event slicing ───────────────────────────────────────
// 按 phase 拆分事件（每个 status 事件是 phase 边界）

interface PhaseSlice {
  phase: PhaseId;
  round: number;
  startedAt: number;
  events: StreamEvent[];
  isCurrent: boolean;
}

function sliceByPhase(events: StreamEvent[], currentPhase: PhaseId, currentRound: number): PhaseSlice[] {
  const slices: PhaseSlice[] = [];
  let cur: PhaseSlice | null = null;
  let idx = 0;
  for (const ev of events) {
    idx++;
    if (ev.type === 'status' && ev.phase) {
      if (cur) slices.push(cur);
      cur = {
        phase: ev.phase as PhaseId,
        round: ev.round || 1,
        startedAt: idx,
        events: [],
        isCurrent: false,
      };
      continue;
    }
    if (cur) cur.events.push(ev);
  }
  if (cur) slices.push(cur);

  // 标记 current
  for (let i = slices.length - 1; i >= 0; i--) {
    if (slices[i].phase === currentPhase && slices[i].round === currentRound) {
      slices[i].isCurrent = true;
      break;
    }
  }
  return slices;
}

// ─── Main StageView ────────────────────────────────────────────

interface StageViewProps {
  events: StreamEvent[];
}

export function StageView({ events }: StageViewProps) {
  const stage = useStageState(events);

  if (stage.kind === 'idle') return null;
  if (stage.kind === 'error') return <ErrorStage stage={stage} />;
  if (stage.kind === 'done') return <ResultStage stage={stage} events={events} />;
  return <ProcessStage stage={stage} events={events} />;
}

// ─── Process stage：timeline + 流式 ────────────────────────────

function ProcessStage({ stage, events }: { stage: ProcessSnapshot; events: StreamEvent[] }) {
  const slices = useMemo(() => sliceByPhase(events, stage.phase, stage.round), [events, stage.phase, stage.round]);

  return (
    <div className="space-y-4 py-1">
      {/* ── 顶部进度条：5 圆点 + meta ── */}
      <div className="rounded-2xl border border-border/30 bg-card/30 backdrop-blur-sm px-5 py-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/55 mb-3">
          {stage.isLive && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-warm)] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-warm)]" />
            </span>
          )}
          <span>第 {stage.round} 轮</span>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-foreground/60">{PHASE_LABEL[stage.phase] || stage.phase}</span>
          <span className="ml-auto normal-case tracking-normal text-muted-foreground/45 tabular-nums text-[11px]">
            {stage.toolDone} 搜索 · {stage.paperCount} 文献 · {stage.ideaCount} 创意
          </span>
        </div>
        <PhaseDots currentPhase={stage.phase} phaseIdx={stage.phaseIdx} />
      </div>

      {/* ── Timeline of phase rows ── */}
      <div className="space-y-1.5">
        {PHASE_ORDER.map((p, i) => {
          // 找该 phase 在当前 round 的 slice
          const slice = slices.find(s => s.phase === p && s.round === stage.round);
          const status = derivePhaseStatus(p, slice, stage.phaseIdx, i);
          return (
            <PhaseRow
              key={`${p}-${stage.round}`}
              phase={p}
              status={status}
              slice={slice}
              isCurrent={status === 'active'}
            />
          );
        })}
      </div>
    </div>
  );
}

type PhaseStatus = 'pending' | 'active' | 'done';

function derivePhaseStatus(
  phase: PhaseId,
  slice: PhaseSlice | undefined,
  currentPhaseIdx: number,
  selfIdx: number,
): PhaseStatus {
  if (!slice) return selfIdx < currentPhaseIdx ? 'done' : 'pending';
  if (slice.isCurrent) return 'active';
  return selfIdx < currentPhaseIdx ? 'done' : 'pending';
}

// ─── Phase row：headers + body（折叠/展开）────────────────────

function PhaseRow({
  phase, status, slice, isCurrent,
}: { phase: PhaseId; status: PhaseStatus; slice?: PhaseSlice; isCurrent: boolean }) {
  // 默认：active 展开，done 折叠，pending 折叠
  const [expanded, setExpanded] = useState(isCurrent);
  useEffect(() => {
    if (isCurrent) setExpanded(true);
  }, [isCurrent]);

  const summary = slice ? deriveSummary(phase, slice) : '';

  return (
    <div className={`rounded-lg border transition-colors ${
      status === 'active' ? 'border-[var(--color-warm)]/30 bg-[var(--color-warm)]/[0.02]'
      : status === 'done' ? 'border-border/40'
      : 'border-border/20 opacity-60'
    }`}>
      <button
        onClick={() => slice && setExpanded(v => !v)}
        disabled={!slice}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left disabled:cursor-default group"
      >
        <PhaseStatusIcon status={status} />
        <span className={`text-[13px] font-medium ${
          status === 'active' ? 'text-foreground/90'
          : status === 'done' ? 'text-foreground/65'
          : 'text-muted-foreground/45'
        }`}>
          {PHASE_LABEL[phase]}
        </span>
        {summary && (
          <span className="text-[11px] text-muted-foreground/50 tabular-nums">
            {summary}
          </span>
        )}
        {slice && (
          <ChevronRight
            className={`ml-auto h-3 w-3 text-muted-foreground/35 transition-transform duration-200 ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        )}
      </button>

      {slice && expanded && (
        <div className="px-3.5 pb-3 pt-0.5 border-t border-border/20 animate-fade-in">
          <PhaseBody phase={phase} events={slice.events} isCurrent={isCurrent} />
        </div>
      )}
    </div>
  );
}

function PhaseStatusIcon({ status }: { status: PhaseStatus }) {
  if (status === 'active') {
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--color-warm)]/85" />;
  }
  if (status === 'done') {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-warm)]/55" />;
  }
  return <span className="h-3.5 w-3.5 shrink-0 inline-flex items-center justify-center">
    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/25" />
  </span>;
}

function deriveSummary(phase: PhaseId, slice: PhaseSlice): string {
  const tools = slice.events.filter(e => e.type === 'tool').length;
  const papers = slice.events
    .filter(e => e.type === 'tool' && typeof e.result_count === 'number')
    .reduce((s, e) => s + (e.result_count || 0), 0);
  const ideas = slice.events.filter(e => e.type === 'idea').length;

  if (phase === 'separate') {
    return [tools && `${tools} 搜索`, papers && `${papers} 文献`, ideas && `${ideas} 创意`]
      .filter(Boolean).join(' · ');
  }
  if (phase === 'cluster') {
    const groups = slice.events.find(e => e.type === 'cluster_groups');
    return groups ? `${groups.groups?.length || 0} 组` : '';
  }
  if (phase === 'together') {
    const synth = slice.events.filter(e => e.type === 'agent' && e.action === 'synthesis').length;
    return [tools && `${tools} 搜索`, papers && `${papers} 文献`, synth && `${synth} 整合`]
      .filter(Boolean).join(' · ');
  }
  if (phase === 'synthesize') {
    return tools ? `${tools} 搜索 · 跨组整合` : '跨组整合中';
  }
  if (phase === 'evaluate') {
    const matches = slice.events.filter(e => e.type === 'evaluate_match').length;
    const votes = slice.events.filter(e => e.type === 'vote').length;
    return votes ? `${votes} 名次` : matches ? `${matches} 对比` : '';
  }
  return '';
}

// ─── Phase body：根据 phase 类型渲染不同视图 ─────────────────

function PhaseBody({ phase, events, isCurrent }: { phase: PhaseId; events: StreamEvent[]; isCurrent: boolean }) {
  if (phase === 'separate') return <SeparateBody events={events} isLive={isCurrent} />;
  if (phase === 'cluster') return <ClusterBody events={events} />;
  if (phase === 'together') return <TogetherBody events={events} isLive={isCurrent} />;
  if (phase === 'synthesize') return <SynthesizeBody events={events} isLive={isCurrent} />;
  if (phase === 'evaluate') return <EvaluateBody events={events} />;
  return null;
}

// ─── Separate body：两个 agent 并列 ────────────────────────────

function SeparateBody({ events, isLive }: { events: StreamEvent[]; isLive: boolean }) {
  const agents = useMemo(() => {
    const agentEvents: Record<string, StreamEvent[]> = {};
    for (const e of events) {
      const a = e.agent || e.author;
      if (!a || !AGENT_NAMES[a]) continue;
      if (!agentEvents[a]) agentEvents[a] = [];
      agentEvents[a].push(e);
    }
    return Object.entries(agentEvents).filter(([a]) => a === 'divergent' || a === 'expert');
  }, [events]);

  if (agents.length === 0) {
    return <div className="text-[11.5px] text-muted-foreground/50 py-2">准备启动 agent...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-2">
      {agents.map(([agent, agentEvents]) => (
        <AgentLane key={agent} agent={agent} events={agentEvents} isLive={isLive} compact />
      ))}
    </div>
  );
}

// ─── Cluster body：分组可视化 ──────────────────────────────────

function ClusterBody({ events }: { events: StreamEvent[] }) {
  const groupsEv = events.find(e => e.type === 'cluster_groups');
  const groups: Array<Array<{ id: string; author: string; preview: string }>> = groupsEv?.groups || [];

  if (groups.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground/55 py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        正在按相似度分组创意...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
      {groups.map((group, i) => (
        <div key={i} className="rounded-md border border-border/40 bg-card/30 p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/60">
            <Layers className="h-3 w-3" />
            <span>第 {i + 1} 组</span>
            <span className="ml-auto tabular-nums text-muted-foreground/40">{group.length} 创意</span>
          </div>
          <ul className="space-y-1 text-[11.5px]">
            {group.map(idea => {
              const tone = AGENT_TONE[idea.author];
              return (
                <li key={idea.id} className="flex items-start gap-1.5">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${tone?.dot || 'bg-muted-foreground/40'}`} />
                  <div className="min-w-0 flex-1">
                    <span className={`text-[10px] font-medium ${tone?.text || 'text-muted-foreground/65'}`}>
                      {AGENT_NAMES[idea.author] || idea.author}
                    </span>
                    <p className="text-foreground/65 leading-snug line-clamp-2">{idea.preview}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── Together body：每个 group 一个块，每个 group 内每个 iteration 一个块 ──

function TogetherBody({ events, isLive }: { events: StreamEvent[]; isLive: boolean }) {
  // 按 group_idx 分组
  const groupMap = useMemo(() => {
    const m = new Map<number, StreamEvent[]>();
    for (const e of events) {
      const g = typeof e.group_idx === 'number' ? e.group_idx : null;
      if (g === null) continue; // 没 group_idx 的事件忽略（避免幽灵组）
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(e);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [events]);

  if (groupMap.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground/55 py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        正在启动小组评议...
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-2">
      {groupMap.map(([groupIdx, groupEvents]) => (
        <TogetherGroupBlock
          key={groupIdx}
          groupIdx={groupIdx}
          events={groupEvents}
          isLive={isLive}
        />
      ))}
    </div>
  );
}

function TogetherGroupBlock({
  groupIdx, events, isLive,
}: { groupIdx: number; events: StreamEvent[]; isLive: boolean }) {
  // 按 iteration 分子组
  const iterMap = useMemo(() => {
    const m = new Map<number, StreamEvent[]>();
    for (const e of events) {
      const it = typeof e.iteration === 'number' ? e.iteration : 0;
      if (!m.has(it)) m.set(it, []);
      m.get(it)!.push(e);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [events]);

  // 这个组是否完成（最后一轮的 connector synthesis 已出现）
  const lastIter = iterMap[iterMap.length - 1];
  const groupDone = lastIter?.[1]?.some(e => e.type === 'agent' && e.action === 'synthesis');

  return (
    <div className="rounded-md border border-dashed border-border/45 px-3 py-2 space-y-2">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground/60">
        <span>第 {groupIdx + 1} 组</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="normal-case tabular-nums">{iterMap.length} 轮</span>
        {!groupDone && isLive && (
          <Loader2 className="ml-auto h-3 w-3 animate-spin text-[var(--color-warm)]/70" />
        )}
        {groupDone && (
          <CheckCircle2 className="ml-auto h-3 w-3 text-[var(--color-warm)]/55" />
        )}
      </div>
      {iterMap.map(([iter, iterEvents]) => (
        <TogetherIterationBlock
          key={iter}
          iter={iter}
          totalIters={iterMap.length}
          events={iterEvents}
          isLive={isLive}
        />
      ))}
    </div>
  );
}

function TogetherIterationBlock({
  iter, totalIters, events, isLive,
}: { iter: number; totalIters: number; events: StreamEvent[]; isLive: boolean }) {
  const criticEvents = events.filter(e =>
    e.agent === 'critic' || (e.type === 'agent' && e.action === 'critique')
  );
  const connectorEvents = events.filter(e =>
    e.agent === 'connector' || (e.type === 'agent' && e.action === 'synthesis')
  );

  return (
    <div className="space-y-1.5">
      {totalIters > 1 && (
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 ml-0.5">
          第 {iter + 1} 轮
        </div>
      )}
      <AgentLane agent="critic" events={criticEvents} isLive={isLive} compact />
      <AgentLane agent="connector" events={connectorEvents} isLive={isLive} compact />
    </div>
  );
}

// ─── Synthesize body ──────────────────────────────────────────

function SynthesizeBody({ events, isLive }: { events: StreamEvent[]; isLive: boolean }) {
  return (
    <div className="mt-2">
      <AgentLane agent="connector" events={events} isLive={isLive} compact />
    </div>
  );
}

// ─── Evaluate body：vote 渐进显示 + Elo 条 ────────────────────

function EvaluateBody({ events }: { events: StreamEvent[] }) {
  const matches = events.filter(e => e.type === 'evaluate_match');
  const votes = events.filter(e => e.type === 'vote').sort((a, b) => (a.rank || 99) - (b.rank || 99));

  if (votes.length === 0 && matches.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground/55 py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        评审者正在成对比较创意...
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-2">
      {/* Recent matches（仅当 vote 还未出时显示） */}
      {votes.length === 0 && matches.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">
            正在评审 ({matches.length})
          </div>
          {matches.slice(-5).map((m, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${
                m.winner === 'A' ? 'bg-[var(--color-warm)]/15 text-[var(--color-warm)]' : 'text-muted-foreground/55'
              }`}>
                {AGENT_NAMES[m.a_author] || m.a_author}
              </span>
              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/30" />
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${
                m.winner === 'B' ? 'bg-[var(--color-warm)]/15 text-[var(--color-warm)]' : 'text-muted-foreground/55'
              }`}>
                {AGENT_NAMES[m.b_author] || m.b_author}
              </span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/45 tabular-nums">
                胜者 {m.winner}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Final votes (Elo bar) */}
      {votes.length > 0 && (
        <div className="space-y-1.5">
          {(() => {
            const maxElo = Math.max(...votes.map(v => v.elo_score || 1500));
            const minElo = Math.min(...votes.map(v => v.elo_score || 1500));
            const range = maxElo - minElo || 1;
            return votes.map((v, i) => {
              const pct = 30 + ((v.elo_score - minElo) / range) * 70;
              const isTop = i === 0;
              return (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className={`shrink-0 w-6 text-center font-bold tabular-nums ${
                    isTop ? 'text-[var(--color-warm)]' : 'text-muted-foreground/55'
                  }`}>#{v.rank}</span>
                  <span className="shrink-0 w-16 text-muted-foreground/65 truncate text-[10.5px]">
                    {AGENT_NAMES[v.author] || v.author}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-border/30 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        isTop ? 'bg-[var(--color-warm)]/70' : 'bg-[var(--color-warm)]/30'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground/55 tabular-nums">
                    {Math.round(v.elo_score)}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}

// ─── AgentLane：单个 agent 的工具薄行 + 流式 markdown ────────

function AgentLane({
  agent, events, isLive, compact,
}: { agent: string; events: StreamEvent[]; isLive: boolean; compact?: boolean }) {
  const Icon = AGENT_ICON[agent] || Bot;
  const tone = AGENT_TONE[agent] || { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground/70', bg: 'bg-card/30' };
  const name = AGENT_NAMES[agent] || agent;

  // 累加 content delta 流式渲染
  const streamingContent = useMemo(
    () => events
      .filter(e => e.type === 'agent_content_delta' && (!e.agent || e.agent === agent))
      .map(e => e.delta || '').join(''),
    [events, agent]
  );

  // 工具事件（按 tool_call_started + tool 配对）
  const toolPairs = useMemo(() => deriveToolRows(events, agent), [events, agent]);

  // 是否完成（找到 agent done / critique / synthesis 事件）
  const finalContent = useMemo(() => {
    const final = events.find(e =>
      e.type === 'agent' &&
      (e.action === 'critique' || e.action === 'synthesis' || e.action === 'idea')
      && (!e.agent || e.agent === agent)
      && typeof e.content === 'string' && e.content.length > 30
    );
    return final?.content || '';
  }, [events, agent]);

  const isDone = !!finalContent || events.some(e =>
    e.type === 'agent' && e.action === 'done' && (!e.agent || e.agent === agent)
  );
  const showStreaming = streamingContent.length > 0 && !finalContent;

  if (toolPairs.length === 0 && !showStreaming && !finalContent) {
    return (
      <div className={`rounded-md border border-border/30 ${tone.bg} px-2.5 py-1.5`}>
        <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/45">
          <Icon className="h-3 w-3" />
          <span className={tone.text}>{name}</span>
          <span className="text-muted-foreground/30">待开始</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-md border-l-2 ${
      isLive && !isDone
        ? 'border-l-[var(--color-warm)]/55 tool-call-active'
        : 'border-l-border/45'
    } ${tone.bg} px-2.5 py-1.5 space-y-1`}>
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3 w-3 ${tone.text}`} />
        <span className={`text-[10.5px] font-medium ${tone.text}`}>{name}</span>
        {isLive && !isDone && (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-[var(--color-warm)]/65" />
        )}
        {isDone && (
          <CheckCircle2 className="h-2.5 w-2.5 text-[var(--color-warm)]/55" />
        )}
      </div>

      {/* Tool rows（极简薄行）*/}
      {toolPairs.length > 0 && (
        <div className="space-y-0">
          {toolPairs.map((t, i) => <ToolRow key={i} tool={t} />)}
        </div>
      )}

      {/* 流式 markdown（实时累加）*/}
      {showStreaming && (
        <div className="rounded bg-card/40 px-2 py-1.5 text-[12px] leading-[1.65] text-foreground/75 max-h-64 overflow-y-auto">
          <MarkdownViewer content={streamingContent} compact />
          <span className="ml-1 inline-block h-3 w-1.5 align-middle bg-[var(--color-warm)]/55 animate-pulse" />
        </div>
      )}

      {/* 完成后的最终内容（折叠，点击展开看全文）*/}
      {finalContent && (
        <FinalContentBlock content={finalContent} />
      )}
    </div>
  );
}

function FinalContentBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const wordCount = content.length;
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/55 hover:text-foreground/70 transition-colors py-0.5"
      >
        <ChevronRight className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span>{open ? '收起' : '展开完整内容'}</span>
        <span className="text-muted-foreground/30 tabular-nums">· {wordCount} 字</span>
      </button>
      {open && (
        <div className="mt-1 rounded bg-card/40 px-2 py-1.5 text-[12px] leading-[1.65] text-foreground/75 max-h-80 overflow-y-auto animate-fade-in">
          <MarkdownViewer content={content} compact />
        </div>
      )}
    </div>
  );
}

// ─── Tool rows ─────────────────────────────────────────────────

interface ToolRowData {
  tool: string;
  query: string;
  resultCount: number | null;
  inflight: boolean;
}

function deriveToolRows(events: StreamEvent[], agent: string): ToolRowData[] {
  const starts = events.filter(e =>
    e.type === 'tool_call_started' && (!e.agent || e.agent === agent)
  );
  const dones = events.filter(e =>
    e.type === 'tool' && (!e.agent || e.agent === agent)
  );

  // 按出现顺序配对
  const rows: ToolRowData[] = [];
  let doneIdx = 0;
  for (const s of starts) {
    const matchedDone = dones[doneIdx];
    rows.push({
      tool: s.tool || '',
      query: s.query || matchedDone?.query || '',
      resultCount: matchedDone?.result_count ?? null,
      inflight: !matchedDone,
    });
    if (matchedDone) doneIdx++;
  }
  // 极少数情况：dones > starts（事件丢失），追加剩余 done
  while (doneIdx < dones.length) {
    const d = dones[doneIdx++];
    rows.push({
      tool: d.tool || '',
      query: d.query || '',
      resultCount: d.result_count ?? null,
      inflight: false,
    });
  }
  return rows;
}

const TOOL_ICONS: Record<string, typeof Globe> = {
  web_search: Globe,
  arxiv_search: BookOpen,
  scholar_search: BookOpen,
  doc_parse: FileText,
};

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Web',
  arxiv_search: 'arXiv',
  scholar_search: 'Scholar',
  doc_parse: '文档',
};

function ToolRow({ tool }: { tool: ToolRowData }) {
  const Icon = TOOL_ICONS[tool.tool] || BookOpen;
  const label = TOOL_LABELS[tool.tool] || tool.tool;
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5 text-[10.5px]">
      {tool.inflight ? (
        <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-[var(--color-warm)]/65" />
      ) : (
        <Icon className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
      )}
      <span className="text-muted-foreground/55 shrink-0">{label}</span>
      <span className="flex-1 truncate text-foreground/55 font-mono tracking-tight">
        {tool.query}
      </span>
      {tool.resultCount != null && (
        <span className="shrink-0 text-muted-foreground/35 tabular-nums">
          {tool.resultCount}
        </span>
      )}
    </div>
  );
}

// ─── Phase dots progress ───────────────────────────────────────

function PhaseDots({ currentPhase, phaseIdx }: { currentPhase: PhaseId; phaseIdx: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {PHASE_ORDER.map((p, i) => {
        const isCurrent = p === currentPhase;
        const isDone = phaseIdx > i || currentPhase === 'done' || currentPhase === 'converged';
        return (
          <div key={p} className="flex items-center gap-1.5 flex-1">
            {i > 0 && (
              <div
                className={`h-px flex-1 transition-colors duration-300 ${
                  isDone || isCurrent ? 'bg-[var(--color-warm)]/35' : 'bg-border/40'
                }`}
              />
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              {isCurrent ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-warm)] opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-warm)]" />
                </span>
              ) : (
                <span
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    isDone ? 'bg-[var(--color-warm)]/50' : 'bg-border/60'
                  }`}
                />
              )}
              <span
                className={`text-[10px] tracking-wider transition-colors ${
                  isCurrent
                    ? 'text-[var(--color-warm)]/85 font-medium'
                    : isDone
                      ? 'text-muted-foreground/55'
                      : 'text-muted-foreground/30'
                }`}
              >
                {PHASE_LABEL[p]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Result stage ──────────────────────────────────────────────

function ResultStage({ stage, events }: { stage: DoneSnapshot; events: StreamEvent[] }) {
  const top3 = stage.topIdeas.slice(0, 3);
  const rest = stage.topIdeas.slice(3);
  const [showProcess, setShowProcess] = useState(false);

  return (
    <div className="space-y-7 py-2 animate-fade-in">
      <div className="border-l-2 border-[var(--color-warm)] pl-4 py-1">
        <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-warm)]/75">
          已完成
        </div>
        <h2
          className="mt-1.5 text-[22px] tracking-tight text-foreground/85"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {stage.topIdeas.length > 0
            ? `${stage.topIdeas.length} 个 Top 创意已生成`
            : '生成完成'}
        </h2>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground/55 tabular-nums">
          <span>{stage.toolDone} 次搜索</span>
          <span className="text-muted-foreground/25">·</span>
          <span>{stage.paperCount} 篇文献</span>
          <span className="text-muted-foreground/25">·</span>
          <span>{stage.ideaCount} 个候选</span>
          {stage.costUsd > 0 && (
            <>
              <span className="text-muted-foreground/25">·</span>
              <span className="flex items-center gap-0.5 text-[var(--color-warm)]/70">
                <DollarSign className="h-2.5 w-2.5" />
                {stage.costUsd.toFixed(4)}
              </span>
            </>
          )}
        </div>
      </div>

      {top3.length > 0 && (
        <div className="space-y-5">
          {top3.map((idea, i) => (
            <ResultCard key={idea.id} idea={idea} rank={i + 1} delayMs={i * 80} />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40">
            其他候选
          </p>
          {rest.map((idea, i) => (
            <div
              key={idea.id}
              className="rounded-md border border-border/35 px-3.5 py-2.5 hover:border-[var(--color-warm)]/30 transition-colors"
            >
              <div className="mb-1 flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground/50 tabular-nums">#{i + 4}</span>
                <span className="text-muted-foreground/55">
                  {AGENT_NAMES[idea.author] || idea.author}
                </span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/35 tabular-nums">
                  Elo {Math.round(idea.elo_score)}
                </span>
              </div>
              <MarkdownViewer content={idea.content} compact />
            </div>
          ))}
        </div>
      )}

      {/* 处理过程回看入口 —— 不止结果出口，也提供一个回去的入口 */}
      <div className="pt-3 border-t border-border/30">
        <button
          onClick={() => setShowProcess(v => !v)}
          className="group flex items-center gap-2 text-[11.5px] text-muted-foreground/65 hover:text-[var(--color-warm)] transition-colors"
          title="展开 5 个 phase 的完整时间线"
        >
          <History className="h-3 w-3" />
          <span>{showProcess ? '收起处理过程' : '查看完整处理过程'}</span>
          <ChevronRight className={`h-3 w-3 transition-transform ${showProcess ? 'rotate-90' : ''}`} />
        </button>
        {showProcess && <ProcessTimelineRecap events={events} />}
      </div>
    </div>
  );
}

// ─── Process timeline recap：done 后回看 5 phase 完整过程 ────────────

function ProcessTimelineRecap({ events }: { events: StreamEvent[] }) {
  // 跨 round 切片所有 phase
  const slices = useMemo(() => {
    const all: PhaseSlice[] = [];
    let cur: PhaseSlice | null = null;
    let idx = 0;
    for (const ev of events) {
      idx++;
      if (ev.type === 'status' && ev.phase && PHASE_ORDER.includes(ev.phase as PhaseId)) {
        if (cur) all.push(cur);
        cur = {
          phase: ev.phase as PhaseId,
          round: ev.round || 1,
          startedAt: idx,
          events: [],
          isCurrent: false,
        };
        continue;
      }
      if (cur) cur.events.push(ev);
    }
    if (cur) all.push(cur);
    return all;
  }, [events]);

  const byRound = useMemo(() => {
    const m = new Map<number, PhaseSlice[]>();
    for (const s of slices) {
      if (!m.has(s.round)) m.set(s.round, []);
      m.get(s.round)!.push(s);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [slices]);

  if (byRound.length === 0) {
    return (
      <div className="mt-3 text-[11.5px] text-muted-foreground/55">
        无处理过程记录
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4 animate-fade-in">
      {byRound.map(([round, roundSlices]) => (
        <div key={round} className="space-y-1.5">
          {byRound.length > 1 && (
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/45 ml-0.5">
              第 {round} 轮
            </div>
          )}
          {PHASE_ORDER.map(p => {
            const slice = roundSlices.find(s => s.phase === p);
            if (!slice) return null;
            return (
              <PhaseRow
                key={`${p}-${round}`}
                phase={p}
                status="done"
                slice={slice}
                isCurrent={false}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

const RANK_TONE: Record<number, { border: string; trophy: string; bg: string }> = {
  1: {
    border: 'border-amber-300/60 dark:border-amber-500/40',
    trophy: 'text-amber-500 dark:text-amber-400',
    bg: 'bg-gradient-to-br from-amber-50/40 via-transparent to-transparent dark:from-amber-900/10',
  },
  2: {
    border: 'border-stone-300/60 dark:border-stone-500/40',
    trophy: 'text-stone-400 dark:text-stone-300',
    bg: 'bg-gradient-to-br from-stone-50/30 via-transparent to-transparent dark:from-stone-900/10',
  },
  3: {
    border: 'border-orange-300/55 dark:border-orange-500/35',
    trophy: 'text-orange-500 dark:text-orange-400',
    bg: 'bg-gradient-to-br from-orange-50/25 via-transparent to-transparent dark:from-orange-900/10',
  },
};

function ResultCard({ idea, rank, delayMs }: { idea: TopIdea; rank: number; delayMs: number }) {
  const tone = RANK_TONE[rank] || RANK_TONE[3];
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  return (
    <article
      className={`relative rounded-2xl border-2 ${tone.border} ${tone.bg} px-6 py-5 transition-all duration-700 ease-out ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      }`}
    >
      <div className="mb-3 flex items-baseline gap-3">
        <Trophy className={`h-5 w-5 shrink-0 ${tone.trophy}`} />
        <div
          className="text-[28px] leading-none font-bold tabular-nums text-foreground/85"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          #{rank}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12px] font-medium text-foreground/65">
            {AGENT_NAMES[idea.author] || idea.author}
          </span>
        </div>
        <span className="ml-auto rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11px] font-mono font-semibold tabular-nums text-foreground/65">
          Elo {Math.round(idea.elo_score)}
        </span>
      </div>

      <div className="border-t border-border/25 pt-4">
        <MarkdownViewer content={idea.content} />
      </div>
    </article>
  );
}

// ─── Error stage ───────────────────────────────────────────────

function ErrorStage({ stage }: { stage: ErrorSnapshot }) {
  return (
    <div className="rounded-xl border border-destructive/25 bg-destructive/[0.04] p-4 animate-fade-in">
      <div className="flex items-center gap-2 text-[12px] font-medium text-destructive/85">
        <AlertTriangle className="h-3.5 w-3.5" />
        生成失败
      </div>
      <p className="mt-1.5 text-[12.5px] text-destructive/70 leading-relaxed">{stage.message}</p>
    </div>
  );
}
