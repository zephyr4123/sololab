'use client';

import { useState, type ReactNode } from 'react';
import { Sparkles, Search, MessageSquare, Brain, Scale, Trophy, CheckCircle, AlertTriangle, Bot, Globe, BookOpen } from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';
import { PipelineView } from './PipelineView';

interface StreamEvent {
  type: string;
  [key: string]: any;
}

interface StreamRendererProps {
  events: StreamEvent[];
}

const PHASE_LABELS: Record<string, string> = {
  separate: '发散生成',
  cluster: '语义聚类',
  together: '分组讨论',
  synthesize: '全局综合',
  evaluate: '综合评审',
  converged: '已收敛',
  done: '完成',
};

const AGENT_COLORS: Record<string, string> = {
  divergent: 'agent-divergent',
  expert: 'agent-expert',
  critic: 'agent-critic',
  connector: 'agent-connector',
  evaluator: 'agent-evaluator',
};

const AGENT_ICON_COMPONENTS: Record<string, typeof Brain> = {
  divergent: Sparkles,
  expert: Search,
  critic: MessageSquare,
  connector: Brain,
  evaluator: Scale,
};

const AGENT_NAMES: Record<string, string> = {
  divergent: '发散者',
  expert: '领域专家',
  critic: '审辩者',
  connector: '整合者',
  evaluator: '评审者',
};

function AgentIcon({ agent, className = 'h-3.5 w-3.5' }: { agent: string; className?: string }) {
  const Icon = AGENT_ICON_COMPONENTS[agent] || Bot;
  return <Icon className={className} />;
}

export function StreamRenderer({ events }: StreamRendererProps) {
  if (!events.length) return null;

  const hasPipelineEvents = events.some(e => e.type === 'status');

  if (hasPipelineEvents) {
    return <PipelineView events={events} />;
  }

  return (
    <div className="space-y-3">
      {events.map((event, idx) => (
        <StreamEventCard key={idx} event={event} />
      ))}
    </div>
  );
}

function StreamEventCard({ event }: { event: StreamEvent }) {
  if (event.type === 'status') {
    return (
      <div className="flex items-center justify-center py-2">
        <div className="flex items-center gap-2.5 rounded-full border border-border/50 bg-card/60 px-4 py-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warm)] animate-pulse" />
          {PHASE_LABELS[event.phase] || event.phase}
          {event.round && <span className="text-muted-foreground/50">{'\u7B2C'} {event.round} {'\u8F6E'}</span>}
          {event.idea_count != null && <span className="text-muted-foreground/50">{event.idea_count} {'\u4E2A\u521B\u610F'}</span>}
          {event.group_count != null && <span className="text-muted-foreground/50">{event.group_count} {'\u4E2A\u8BA8\u8BBA\u7EC4'}</span>}
        </div>
      </div>
    );
  }

  if (event.type === 'idea') {
    const agentClass = AGENT_COLORS[event.author] || '';
    return (
      <div className={`rounded-xl border p-3.5 ${agentClass}`} style={{
        backgroundColor: 'var(--agent-bg)',
        color: 'var(--agent-fg)',
        borderColor: 'var(--agent-border)',
      }}>
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold">
          <AgentIcon agent={event.author} />
          <span>{AGENT_NAMES[event.author] || event.author}</span>
          <span className="font-normal opacity-50">提出了新创意</span>
        </div>
        <div className="text-foreground">
          <MarkdownViewer content={event.content} compact />
        </div>
      </div>
    );
  }

  if (event.type === 'agent') {
    const agentClass = AGENT_COLORS[event.agent] || '';

    if (event.content) {
      return (
        <div className={`rounded-xl border p-3.5 ${agentClass}`} style={{
          backgroundColor: 'var(--agent-bg)',
          color: 'var(--agent-fg)',
          borderColor: 'var(--agent-border)',
        }}>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold">
            <AgentIcon agent={event.agent} />
            <span>{AGENT_NAMES[event.agent] || event.agent}</span>
            <span className="rounded-md bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium">{event.action}</span>
          </div>
          <div className="text-foreground">
            <CollapsibleContent content={event.content} />
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 py-1.5 text-[11px] text-muted-foreground/50">
        <AgentIcon agent={event.agent} className="h-3 w-3" />
        <span className="font-medium">{AGENT_NAMES[event.agent] || event.agent}</span>
        <span>
          {event.action === 'thinking'
            ? '正在思考...'
            : event.action === 'done'
              ? `完成 (${event.message_count || 0} 条消息)`
              : event.action}
        </span>
      </div>
    );
  }

  if (event.type === 'tool') {
    const ToolIcon = event.tool === 'web_search' ? Globe : BookOpen;
    const toolLabel = event.tool === 'web_search' ? 'Web' : event.tool === 'arxiv_search' ? 'arXiv' : event.tool === 'scholar_search' ? 'Scholar' : event.tool;
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-border bg-card/40 px-3.5 py-2.5 text-[11px]">
        <ToolIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium text-foreground/70">
            <span>{AGENT_NAMES[event.agent] || event.agent}</span>
            <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{toolLabel}</span>
            {event.success ? (
              <CheckCircle className="h-3 w-3 text-[var(--color-warm)]" />
            ) : (
              <AlertTriangle className="h-3 w-3 text-destructive" />
            )}
          </div>
          <p className="mt-0.5 text-muted-foreground/60 truncate">
            {event.query}
            {event.result_count > 0 && <span className="ml-1 text-muted-foreground/40">({event.result_count} results)</span>}
          </p>
          {event.result_preview && (
            <p className="mt-0.5 text-muted-foreground/40 line-clamp-2">{event.result_preview}</p>
          )}
          {event.error && (
            <p className="mt-0.5 text-destructive/80">{event.error}</p>
          )}
        </div>
      </div>
    );
  }

  if (event.type === 'vote') {
    return (
      <div className="rounded-xl border border-[var(--color-warm)]/20 bg-[var(--color-warm)]/5 p-3.5">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-warm)]">
            <Trophy className="h-3.5 w-3.5" />
            <span>#{event.rank}</span>
            <span className="font-normal text-muted-foreground">{AGENT_NAMES[event.author] || event.author}</span>
          </div>
          <span className="rounded-md border border-[var(--color-warm)]/20 bg-[var(--color-warm)]/10 px-2 py-0.5 text-[11px] font-bold text-[var(--color-warm)]" style={{ fontFamily: 'var(--font-mono)' }}>
            Elo {event.elo_score}
          </span>
        </div>
        <MarkdownViewer content={event.content} compact />
      </div>
    );
  }

  if (event.type === 'done') {
    return (
      <div className="rounded-xl border border-[var(--color-warm)]/20 bg-[var(--color-warm)]/5 p-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <CheckCircle className="h-4 w-4 text-[var(--color-warm)]" />
          <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            生成完成
          </p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          共产出 {event.top_ideas?.length || 0} 个 Top 创意
          {event.cost_usd > 0 && <span className="ml-2">费用: ${event.cost_usd}</span>}
        </p>
      </div>
    );
  }

  if (event.type === 'error') {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>错误</span>
        </div>
        <p className="mt-1 text-sm text-destructive/80">{event.message || event.error || 'Unknown error'}</p>
      </div>
    );
  }

  return null;
}

const COLLAPSE_THRESHOLD = 300;

function CollapsibleContent({ content }: { content: string }) {
  const isLong = content.length > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(!isLong);

  return (
    <div>
      <div className={expanded ? '' : 'relative max-h-28 overflow-hidden'}>
        <MarkdownViewer content={content} compact />
        {!expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--agent-bg)] to-transparent" />
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-[11px] font-medium text-[var(--color-warm)] hover:underline"
        >
          {expanded ? '收起' : '展开全文'}
        </button>
      )}
    </div>
  );
}
