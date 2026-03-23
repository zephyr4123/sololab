'use client';

import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { Brain, Search, MessageSquare, Sparkles, Scale } from 'lucide-react';

const AGENT_ICONS: Record<string, typeof Brain> = {
  divergent: Sparkles,
  expert: Search,
  critic: MessageSquare,
  connector: Brain,
  evaluator: Scale,
};

const AGENT_COLORS: Record<string, string> = {
  divergent: 'text-purple-500',
  expert: 'text-blue-500',
  critic: 'text-red-500',
  connector: 'text-green-500',
  evaluator: 'text-yellow-500',
};

const AGENT_NAMES: Record<string, string> = {
  divergent: '发散者',
  expert: '领域专家',
  critic: '审辩者',
  connector: '整合者',
  evaluator: '评审者',
};

const STATUS_LABELS: Record<string, string> = {
  idle: '待命',
  thinking: '思考中',
  done: '完成',
  executing: '执行中',
  critique: '审辩中',
  synthesis: '整合中',
};

export function AgentPanel() {
  const { agentEvents, phase } = useIdeaSparkStore();

  const agentNames = ['divergent', 'expert', 'critic', 'connector', 'evaluator'];
  const latestStatus = new Map<string, string>();
  for (const e of agentEvents) {
    latestStatus.set(e.agent, e.action);
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">智能体</h3>
      <div className="space-y-2">
        {agentNames.map((name) => {
          const Icon = AGENT_ICONS[name] || Brain;
          const color = AGENT_COLORS[name] || 'text-gray-500';
          const status = latestStatus.get(name) || 'idle';
          const isActive = status !== 'idle' && status !== 'done' && phase !== 'idle' && phase !== 'done';

          return (
            <div key={name} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="flex-1 font-medium">{AGENT_NAMES[name] || name}</span>
              <span className={`text-xs ${isActive ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`}>
                {STATUS_LABELS[status] || status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
