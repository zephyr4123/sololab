'use client';

import { useState, useMemo, memo } from 'react';
import {
  Sparkles, Search, MessageSquare, Brain, Scale, Bot,
  Globe, BookOpen, FileText, Trophy, CheckCircle, AlertTriangle,
  ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';

interface StreamEvent {
  type: string;
  [key: string]: any;
}

// ─── Constants ───────────────────────────────────────────────

const PHASE_META: Record<string, { label: string; description: string }> = {
  separate:   { label: '发散生成', description: '发散者和领域专家独立探索创意' },
  cluster:    { label: '语义聚类', description: '按语义相似度将创意分组' },
  together:   { label: '分组讨论', description: '审辩者质疑 + 整合者综合' },
  synthesize: { label: '全局综合', description: '跨组去重与融合' },
  evaluate:   { label: '锦标赛评估', description: 'Elo 评分排名 Top 创意' },
  converged:  { label: '已收敛', description: 'Top 创意稳定，流程结束' },
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

const AGENT_COLORS: Record<string, string> = {
  divergent: 'border-purple-200 bg-purple-50/50 dark:border-purple-700/50 dark:bg-purple-950/30',
  expert: 'border-blue-200 bg-blue-50/50 dark:border-blue-700/50 dark:bg-blue-950/30',
  critic: 'border-red-200 bg-red-50/50 dark:border-red-700/50 dark:bg-red-950/30',
  connector: 'border-green-200 bg-green-50/50 dark:border-green-700/50 dark:bg-green-950/30',
  evaluator: 'border-amber-200 bg-amber-50/50 dark:border-amber-700/50 dark:bg-amber-950/30',
};

const AGENT_ACCENT: Record<string, string> = {
  divergent: 'text-purple-700 dark:text-purple-400', expert: 'text-blue-700 dark:text-blue-400', critic: 'text-red-700 dark:text-red-400',
  connector: 'text-green-700 dark:text-green-400', evaluator: 'text-amber-700 dark:text-amber-400',
};

// ─── Phase grouping logic ────────────────────────────────────

interface PhaseGroup {
  phase: string;
  round: number;
  meta: { ideaCount?: number; groupCount?: number; candidateCount?: number };
  events: StreamEvent[];
}

function groupEventsByPhase(events: StreamEvent[]): { rounds: Map<number, PhaseGroup[]>; currentPhase: string; currentRound: number } {
  const rounds = new Map<number, PhaseGroup[]>();
  let currentPhase = '';
  let currentRound = 1;
  let currentGroup: PhaseGroup | null = null;

  for (const event of events) {
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

    if (event.type === 'done' || event.type === 'error' || event.type === 'task_created' || event.type === 'doc_context') {
      // These are top-level events, not part of a phase
      continue;
    }

    if (currentGroup) {
      currentGroup.events.push(event);
    }
  }

  return { rounds, currentPhase, currentRound };
}

// ─── PipelineView Component ──────────────────────────────────

interface PipelineViewProps {
  events: StreamEvent[];
}

export const PipelineView = memo(function PipelineView({ events }: PipelineViewProps) {
  const { rounds, currentPhase, currentRound } = useMemo(() => groupEventsByPhase(events), [events]);

  const doneEvent = events.find(e => e.type === 'done');
  const errorEvent = events.find(e => e.type === 'error');
  const docContextEvent = events.find(e => e.type === 'doc_context');

  if (events.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Document context injection notice */}
      {docContextEvent && <DocContextSection event={docContextEvent} />}
      {Array.from(rounds.entries()).map(([roundNum, phases]) => (
        <RoundSection
          key={roundNum}
          roundNum={roundNum}
          phases={phases}
          currentPhase={roundNum === currentRound ? currentPhase : ''}
          isCurrentRound={roundNum === currentRound}
        />
      ))}

      {doneEvent && <DoneSection event={doneEvent} />}
      {errorEvent && <ErrorSection event={errorEvent} />}
    </div>
  );
});

// ─── Round Section ───────────────────────────────────────────

function RoundSection({ roundNum, phases, currentPhase, isCurrentRound }: {
  roundNum: number;
  phases: PhaseGroup[];
  currentPhase: string;
  isCurrentRound: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Round header */}
      <div className="flex items-center gap-3">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
          Round {roundNum}
        </div>
        <div className="h-px flex-1 bg-border/60" />
      </div>

      {/* Progress bar */}
      <ProgressBar phases={phases} currentPhase={currentPhase} isActive={isCurrentRound} />

      {/* Phase sections */}
      {phases.map((group, idx) => (
        <PhaseSection key={`${group.phase}-${idx}`} group={group} isActive={isCurrentRound && group.phase === currentPhase} />
      ))}
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
    <div className="flex items-center gap-1 rounded-lg bg-muted/30 px-3 py-2">
      {PHASE_ORDER.map((phase, idx) => {
        const isCompleted = completedPhases.has(phase) && phase !== currentPhase;
        const isCurrent = isActive && phase === currentPhase;
        const meta = PHASE_META[phase];

        return (
          <div key={phase} className="flex items-center gap-1">
            {idx > 0 && <div className={`h-px w-4 ${isCompleted || isCurrent ? 'bg-primary/40' : 'bg-border'}`} />}
            <div
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                isCurrent
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : isCompleted
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground/50'
              }`}
              title={meta?.description}
            >
              {isCurrent && <Loader2 className="h-3 w-3 animate-spin" />}
              {isCompleted && <CheckCircle className="h-3 w-3" />}
              {meta?.label || phase}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Phase Section ───────────────────────────────────────────

function PhaseSection({ group, isActive }: { group: PhaseGroup; isActive: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const meta = PHASE_META[group.phase];

  return (
    <div className={`rounded-xl border transition-all ${isActive ? 'border-primary/30 shadow-sm' : 'border-border/60'}`}>
      {/* Phase header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-sm font-semibold">{meta?.label || group.phase}</span>
        <span className="text-xs text-muted-foreground">{meta?.description}</span>
        {group.meta.ideaCount != null && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{group.meta.ideaCount} 创意</span>
        )}
        {group.meta.groupCount != null && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{group.meta.groupCount} 组</span>
        )}
        {group.meta.candidateCount != null && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{group.meta.candidateCount} 候选</span>
        )}
        {isActive && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-primary" />}
      </button>

      {expanded && group.events.length > 0 && (
        <div className="border-t px-4 py-3">
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

// ─── Separate Phase: Side-by-side agents ─────────────────────

function SeparatePhaseView({ events }: { events: StreamEvent[] }) {
  // Group events by agent
  const agentEvents: Record<string, StreamEvent[]> = {};
  for (const e of events) {
    const agent = e.agent || e.author || 'unknown';
    if (!agentEvents[agent]) agentEvents[agent] = [];
    agentEvents[agent].push(e);
  }

  const agents = Object.keys(agentEvents);

  return (
    <div className={`grid gap-3 ${agents.length >= 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
      {agents.map(agent => (
        <AgentColumn key={agent} agent={agent} events={agentEvents[agent]} />
      ))}
    </div>
  );
}

function AgentColumn({ agent, events }: { agent: string; events: StreamEvent[] }) {
  const Icon = AGENT_ICONS[agent] || Bot;
  const color = AGENT_COLORS[agent] || 'border-gray-200 bg-gray-50/50 dark:border-gray-700/50 dark:bg-gray-800/30';
  const accent = AGENT_ACCENT[agent] || 'text-gray-700 dark:text-gray-300';

  const tools = events.filter(e => e.type === 'tool');
  const ideas = events.filter(e => e.type === 'idea');
  const doneEvent = events.find(e => e.type === 'agent' && e.action === 'done');

  // 流式正文增量：在 idea 事件到达前实时拼接显示，作为 "live preview"
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
    <div className={`rounded-lg border p-3 space-y-2 ${color}`}>
      <div className={`flex items-center gap-2 text-xs font-semibold ${accent}`}>
        <Icon className="h-4 w-4" />
        <span>{AGENT_NAMES[agent] || agent}</span>
        {doneEvent && <CheckCircle className="ml-auto h-3.5 w-3.5 text-green-500 dark:text-green-400" />}
      </div>

      {/* Tool calls */}
      {tools.length > 0 && (
        <div className="space-y-1">
          {tools.map((t, i) => (
            <ToolCallCard key={i} event={t} />
          ))}
        </div>
      )}

      {/* Streaming live preview（在最终 idea 到达前显示）*/}
      {showStreaming && (
        <div className="rounded-md border-l-2 border-primary/40 bg-white/60 dark:bg-white/5 p-2">
          <MarkdownViewer content={streamingContent} compact />
          <span className="ml-1 inline-block h-3 w-2 align-middle bg-primary/60 animate-pulse" />
        </div>
      )}

      {/* Ideas（最终结果）*/}
      {ideas.map((idea, i) => (
        <div key={i} className="rounded-md bg-white/60 dark:bg-white/5 p-2">
          <MarkdownViewer content={idea.content} compact />
        </div>
      ))}
    </div>
  );
}

// ─── Cluster Phase ───────────────────────────────────────────

function ClusterPhaseView({ events }: { events: StreamEvent[] }) {
  return (
    <div className="text-center text-sm text-muted-foreground">
      <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-4 py-1.5">
        <div className="h-2 w-2 rounded-full bg-blue-400 dark:bg-blue-500" />
        创意已按语义相似度完成聚类
      </div>
    </div>
  );
}

// ─── Together Phase: Grouped discussion ──────────────────────

function TogetherPhaseView({ events }: { events: StreamEvent[] }) {
  // Parse group information from agent action strings like "reviewing group 1, round 1"
  const groups: Record<string, StreamEvent[]> = {};
  let currentGroupKey = 'default';

  for (const e of events) {
    if (e.type === 'agent' && e.action && typeof e.action === 'string') {
      const groupMatch = e.action.match(/group\s*(\d+)/i);
      if (groupMatch) {
        currentGroupKey = `group-${groupMatch[1]}`;
      }
    }
    if (!groups[currentGroupKey]) groups[currentGroupKey] = [];
    groups[currentGroupKey].push(e);
  }

  const groupKeys = Object.keys(groups);

  return (
    <div className="space-y-3">
      {groupKeys.map(key => {
        const groupEvents = groups[key];
        const groupNum = key.replace('group-', '');
        const critiques = groupEvents.filter(e => e.type === 'agent' && e.action === 'critique');
        const syntheses = groupEvents.filter(e => e.type === 'agent' && e.action === 'synthesis');
        const tools = groupEvents.filter(e => e.type === 'tool');

        // 拼接当前组内 critic / connector 的流式增量
        const criticStreaming = groupEvents
          .filter(e => e.type === 'agent_content_delta' && e.agent === 'critic')
          .map(e => e.delta || '').join('');
        const connectorStreaming = groupEvents
          .filter(e => e.type === 'agent_content_delta' && e.agent === 'connector')
          .map(e => e.delta || '').join('');
        // 组内每多一条最终 critique/synthesis 就吞掉一段 streaming（粗粒度）
        const showCriticStreaming = criticStreaming.length > 0 && critiques.length === 0;
        const showConnectorStreaming = connectorStreaming.length > 0 && syntheses.length === 0;

        return (
          <div key={key} className="rounded-lg border border-dashed border-border/80 p-3 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">
              {key === 'default' ? '讨论' : `讨论组 ${groupNum}`}
            </div>

            {tools.length > 0 && (
              <div className="space-y-1">
                {tools.map((t, i) => <ToolCallCard key={i} event={t} />)}
              </div>
            )}

            {showCriticStreaming && (
              <div className="rounded-md border border-red-200/60 bg-red-50/30 dark:border-red-700/40 dark:bg-red-950/20 p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                  <MessageSquare className="h-3 w-3" />
                  审辩者
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                </div>
                <MarkdownViewer content={criticStreaming} compact />
                <span className="ml-1 inline-block h-3 w-2 align-middle bg-red-400/60 animate-pulse" />
              </div>
            )}

            {critiques.map((c, i) => (
              <div key={`c-${i}`} className="rounded-md border border-red-200/60 bg-red-50/30 dark:border-red-700/40 dark:bg-red-950/20 p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                  <MessageSquare className="h-3 w-3" />
                  审辩者
                </div>
                <MarkdownViewer content={c.content} compact />
              </div>
            ))}

            {showConnectorStreaming && (
              <div className="rounded-md border border-green-200/60 bg-green-50/30 dark:border-green-700/40 dark:bg-green-950/20 p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                  <Brain className="h-3 w-3" />
                  整合者
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                </div>
                <MarkdownViewer content={connectorStreaming} compact />
                <span className="ml-1 inline-block h-3 w-2 align-middle bg-green-400/60 animate-pulse" />
              </div>
            )}

            {syntheses.map((s, i) => (
              <div key={`s-${i}`} className="rounded-md border border-green-200/60 bg-green-50/30 dark:border-green-700/40 dark:bg-green-950/20 p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                  <Brain className="h-3 w-3" />
                  整合者
                </div>
                <MarkdownViewer content={s.content} compact />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Synthesize Phase ────────────────────────────────────────

function SynthesizePhaseView({ events }: { events: StreamEvent[] }) {
  const syntheses = events.filter(e => e.type === 'agent' && e.content);

  return (
    <div className="space-y-2">
      {syntheses.map((s, i) => (
        <div key={i} className="rounded-md border border-green-200/60 bg-green-50/30 dark:border-green-700/40 dark:bg-green-950/20 p-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
            <Brain className="h-3 w-3" />
            全局整合
          </div>
          <MarkdownViewer content={s.content} compact />
        </div>
      ))}
      {syntheses.length === 0 && (
        <div className="text-center text-xs text-muted-foreground py-2">
          <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
          正在进行跨组综合...
        </div>
      )}
    </div>
  );
}

// ─── Evaluate Phase: Tournament ranking ──────────────────────

function EvaluatePhaseView({ events }: { events: StreamEvent[] }) {
  const votes = events.filter(e => e.type === 'vote').sort((a, b) => (a.rank || 99) - (b.rank || 99));

  if (votes.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-2">
        <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
        评审者正在进行锦标赛...
      </div>
    );
  }

  const maxElo = Math.max(...votes.map(v => v.elo_score || 1500));
  const minElo = Math.min(...votes.map(v => v.elo_score || 1500));
  const eloRange = maxElo - minElo || 1;

  return (
    <div className="space-y-2">
      {votes.map((v, i) => {
        const barWidth = 30 + ((v.elo_score - minElo) / eloRange) * 70;
        const isTop = i === 0;

        return (
          <div
            key={i}
            className={`rounded-lg border p-3 transition-all ${
              isTop ? 'border-amber-300 bg-amber-50/50 dark:border-amber-600/50 dark:bg-amber-950/30' : 'border-border/60'
            }`}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className={`text-sm font-bold ${isTop ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                #{v.rank}
              </span>
              <span className="text-xs text-muted-foreground">
                {AGENT_NAMES[v.author] || v.author}
              </span>
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono font-bold">
                Elo {v.elo_score}
              </span>
            </div>
            {/* Elo bar */}
            <div className="mb-2 h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isTop ? 'bg-amber-400 dark:bg-amber-500' : 'bg-primary/30'}`}
                style={{ width: `${barWidth}%` }}
              />
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
    <div className="space-y-2">
      {events.filter(e => e.content).map((e, i) => (
        <div key={i} className="rounded-md border p-2.5 text-sm">
          <MarkdownViewer content={e.content} compact />
        </div>
      ))}
    </div>
  );
}

// ─── Shared: Tool Call Card (expandable with results) ────────

function ToolCallCard({ event }: { event: StreamEvent }) {
  const [expanded, setExpanded] = useState(false);
  const ToolIcon = event.tool === 'web_search' ? Globe : event.tool === 'doc_parse' ? FileText : BookOpen;
  const toolLabel = event.tool === 'web_search' ? 'Web Search'
    : event.tool === 'arxiv_search' ? 'arXiv Search'
    : event.tool === 'scholar_search' ? 'Scholar Search'
    : event.tool === 'doc_parse' ? '文档解析'
    : event.tool;

  const results: Array<{ title: string; url: string; snippet: string }> = event.results || [];

  return (
    <div className="rounded-lg border border-cyan-200/60 bg-cyan-50/40 dark:border-cyan-700/40 dark:bg-cyan-950/20 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] hover:bg-cyan-100/30 dark:hover:bg-cyan-900/20 transition-colors"
      >
        <ToolIcon className="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
        <span className="font-semibold text-cyan-800 dark:text-cyan-300">{toolLabel}</span>
        <span className="flex-1 truncate text-left text-cyan-600/80 dark:text-cyan-400/60">{event.query}</span>
        {event.success ? (
          <CheckCircle className="h-3 w-3 shrink-0 text-green-500 dark:text-green-400" />
        ) : (
          <AlertTriangle className="h-3 w-3 shrink-0 text-red-500 dark:text-red-400" />
        )}
        {event.result_count > 0 && (
          <span className="shrink-0 rounded-full bg-cyan-200/60 dark:bg-cyan-800/40 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-300">
            {event.result_count}
          </span>
        )}
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0 text-cyan-400 dark:text-cyan-500" /> : <ChevronRight className="h-3 w-3 shrink-0 text-cyan-400 dark:text-cyan-500" />}
      </button>

      {/* Results list */}
      {expanded && results.length > 0 && (
        <div className="border-t border-cyan-200/40 dark:border-cyan-700/30 px-2.5 py-1.5 space-y-1">
          {results.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="shrink-0 mt-0.5 text-cyan-400 dark:text-cyan-500 font-mono">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-cyan-700 dark:text-cyan-300 hover:underline line-clamp-1"
                  >
                    {r.title || r.url}
                  </a>
                ) : (
                  <span className="font-medium text-cyan-700 dark:text-cyan-300 line-clamp-1">{r.title}</span>
                )}
                {r.snippet && (
                  <p className="text-cyan-600/60 dark:text-cyan-400/40 line-clamp-2 mt-0.5">{r.snippet}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {expanded && event.error && (
        <div className="border-t border-red-200/40 dark:border-red-700/30 px-2.5 py-1.5 text-[11px] text-red-500 dark:text-red-400">
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
    <div className="rounded-xl border border-indigo-200/60 bg-indigo-50/30 dark:border-indigo-700/40 dark:bg-indigo-950/20 p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400"
      >
        <FileText className="h-3.5 w-3.5" />
        <span>参考文献已注入</span>
        <span className="rounded-full bg-indigo-200/60 dark:bg-indigo-800/40 px-1.5 py-0.5 text-[10px]">
          {event.chunk_count || 0} 个相关分块
        </span>
        {expanded ? <ChevronDown className="ml-auto h-3 w-3" /> : <ChevronRight className="ml-auto h-3 w-3" />}
      </button>
      {expanded && event.preview && (
        <div className="mt-2 rounded-md bg-white/60 dark:bg-white/5 p-2 text-[11px] text-indigo-600/80 dark:text-indigo-400/60 whitespace-pre-wrap line-clamp-6">
          {event.preview}
        </div>
      )}
    </div>
  );
}

// ─── Done / Error Sections ───────────────────────────────────

function DoneSection({ event }: { event: StreamEvent }) {
  return (
    <div className="rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 dark:border-green-700/40 dark:from-green-950/30 dark:to-emerald-950/30 p-4 text-center">
      <div className="flex items-center justify-center gap-2">
        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
        <p className="text-sm font-semibold text-green-800 dark:text-green-300">
          创意生成完成！共产出 {event.top_ideas?.length || 0} 个 Top 创意
        </p>
      </div>
      {event.cost_usd > 0 && (
        <p className="mt-1 text-xs text-green-600 dark:text-green-400">总费用: ${event.cost_usd}</p>
      )}
    </div>
  );
}

function ErrorSection({ event }: { event: StreamEvent }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-700/40 dark:bg-red-950/20 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
        <AlertTriangle className="h-4 w-4" />
        错误
      </div>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{event.message || event.error || 'Unknown error'}</p>
    </div>
  );
}
