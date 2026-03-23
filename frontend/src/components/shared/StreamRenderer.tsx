'use client';

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
  evaluate: '锦标赛评估',
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

const AGENT_ICONS: Record<string, string> = {
  divergent: '\u{1F4A1}',
  expert: '\u{1F52C}',
  critic: '\u{1F50D}',
  connector: '\u{1F517}',
  evaluator: '\u{2696}\u{FE0F}',
};

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
    const icon = AGENT_ICONS[event.author] || '\u{1F4AD}';
    return (
      <div className={`rounded-lg border p-3 ${colorClass}`}>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
          <span>{icon}</span>
          <span className="capitalize">{event.author}</span>
          <span className="font-normal opacity-60">{'\u63D0\u51FA\u4E86\u65B0\u521B\u610F'}</span>
        </div>
        <p className="text-sm leading-relaxed">{event.content}</p>
      </div>
    );
  }

  if (event.type === 'agent') {
    const colorClass = AGENT_COLORS[event.agent] || 'bg-gray-50 text-gray-700';
    const icon = AGENT_ICONS[event.agent] || '\u{1F916}';

    // Events with substantial content (critique, synthesis) show detailed cards
    if (event.content) {
      return (
        <div className={`rounded-lg border p-3 ${colorClass}`}>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
            <span>{icon}</span>
            <span className="capitalize">{event.agent}</span>
            <span className="rounded bg-white/50 px-1.5 py-0.5 text-[10px] font-medium">{event.action}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{event.content}</p>
        </div>
      );
    }

    // Status change events (thinking, done) show as inline indicators
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-gray-500">
        <span>{icon}</span>
        <span className="font-medium capitalize">{event.agent}</span>
        <span>
          {event.action === 'thinking'
            ? '\u6B63\u5728\u601D\u8003...'
            : event.action === 'done'
              ? `\u5B8C\u6210 (${event.message_count || 0} \u6761\u6D88\u606F)`
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
            <span>{'\u{1F3C6}'}</span>
            <span>#{event.rank}</span>
            <span className="font-normal capitalize text-amber-600">by {event.author}</span>
          </div>
          <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
            Elo {event.elo_score}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-amber-900">{event.content}</p>
      </div>
    );
  }

  if (event.type === 'done') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <p className="text-sm font-semibold text-green-800">
          {'\u521B\u610F\u751F\u6210\u5B8C\u6210\uFF01\u5171\u4EA7\u51FA'} {event.top_ideas?.length || 0} {'\u4E2A Top \u521B\u610F'}
        </p>
        {event.cost_usd > 0 && (
          <p className="mt-1 text-xs text-green-600">{'\u603B\u8D39\u7528'}: ${event.cost_usd}</p>
        )}
      </div>
    );
  }

  if (event.type === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-red-700">
          <span>{'\u26A0\uFE0F'}</span>
          <span>{'\u9519\u8BEF'}</span>
        </div>
        <p className="mt-1 text-sm text-red-600">{event.message || event.error || 'Unknown error'}</p>
      </div>
    );
  }

  // Unknown event types are hidden
  return null;
}
