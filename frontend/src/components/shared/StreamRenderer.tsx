'use client';

import { useState, type ReactNode } from 'react';
import { Sparkles, Search, MessageSquare, Brain, Scale, Trophy, CheckCircle, AlertTriangle, Bot } from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';

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
  divergent: 'bg-purple-100 text-purple-800 border-purple-200',
  expert: 'bg-blue-100 text-blue-800 border-blue-200',
  critic: 'bg-red-100 text-red-800 border-red-200',
  connector: 'bg-green-100 text-green-800 border-green-200',
  evaluator: 'bg-amber-100 text-amber-800 border-amber-200',
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
        <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-1.5 text-xs font-medium text-gray-600">
          <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          {PHASE_LABELS[event.phase] || event.phase}
          {event.round && <span className="text-gray-400">{'\u7B2C'} {event.round} {'\u8F6E'}</span>}
          {event.idea_count != null && <span className="text-gray-400">{event.idea_count} {'\u4E2A\u521B\u610F'}</span>}
          {event.group_count != null && <span className="text-gray-400">{event.group_count} {'\u4E2A\u8BA8\u8BBA\u7EC4'}</span>}
        </div>
      </div>
    );
  }

  if (event.type === 'idea') {
    const colorClass = AGENT_COLORS[event.author] || 'bg-gray-100 text-gray-800 border-gray-200';
    return (
      <div className={`rounded-lg border p-3 ${colorClass}`}>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
          <AgentIcon agent={event.author} />
          <span>{AGENT_NAMES[event.author] || event.author}</span>
          <span className="font-normal opacity-60">提出了新创意</span>
        </div>
        <MarkdownViewer content={event.content} compact />
      </div>
    );
  }

  if (event.type === 'agent') {
    const colorClass = AGENT_COLORS[event.agent] || 'bg-gray-50 text-gray-700';

    // Events with substantial content (critique, synthesis) show detailed cards
    if (event.content) {
      return (
        <div className={`rounded-lg border p-3 ${colorClass}`}>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
            <AgentIcon agent={event.agent} />
            <span>{AGENT_NAMES[event.agent] || event.agent}</span>
            <span className="rounded bg-white/50 px-1.5 py-0.5 text-[10px] font-medium">{event.action}</span>
          </div>
          <CollapsibleContent content={event.content} />
        </div>
      );
    }

    // Status change events (thinking, done) show as inline indicators
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-gray-500">
        <AgentIcon agent={event.agent} />
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

  if (event.type === 'vote') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
            <Trophy className="h-3.5 w-3.5" />
            <span>#{event.rank}</span>
            <span className="font-normal text-amber-600">来自 {AGENT_NAMES[event.author] || event.author}</span>
          </div>
          <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
            Elo {event.elo_score}
          </span>
        </div>
        <MarkdownViewer content={event.content} compact />
      </div>
    );
  }

  if (event.type === 'done') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <p className="text-sm font-semibold text-green-800">
            创意生成完成！共产出 {event.top_ideas?.length || 0} 个 Top 创意
          </p>
        </div>
        {event.cost_usd > 0 && (
          <p className="mt-1 text-xs text-green-600">总费用: ${event.cost_usd}</p>
        )}
      </div>
    );
  }

  if (event.type === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-red-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>错误</span>
        </div>
        <p className="mt-1 text-sm text-red-600">{event.message || event.error || 'Unknown error'}</p>
      </div>
    );
  }

  // Unknown event types are hidden
  return null;
}

/** Threshold in characters — content longer than this starts collapsed */
const COLLAPSE_THRESHOLD = 300;

function CollapsibleContent({ content }: { content: string }) {
  const isLong = content.length > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(!isLong);

  return (
    <div>
      <div
        className={
          expanded
            ? ''
            : 'relative max-h-28 overflow-hidden'
        }
      >
        <MarkdownViewer content={content} compact />
        {!expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/80 to-transparent" />
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          {expanded ? '收起' : '展开全文'}
        </button>
      )}
    </div>
  );
}
