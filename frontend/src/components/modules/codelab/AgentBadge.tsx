'use client';

import { Cpu, Eye, Map, Wrench, Pencil } from 'lucide-react';

const AGENT_STYLES: Record<string, { label: string; icon: typeof Cpu; color: string }> = {
  build:   { label: 'Build',   icon: Wrench,  color: 'var(--color-warm)' },
  explore: { label: 'Explore', icon: Eye,     color: '#4B7BB5' },
  plan:    { label: 'Plan',    icon: Map,     color: '#6D5BA3' },
  general: { label: 'General', icon: Cpu,     color: '#78716C' },
};

interface AgentBadgeProps {
  agent: string;
  status: 'idle' | 'thinking' | 'tool_call' | 'writing';
}

export function AgentBadge({ agent, status }: AgentBadgeProps) {
  if (status === 'idle') return null;

  const style = AGENT_STYLES[agent] ?? AGENT_STYLES.general;
  const Icon = style.icon;

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, ${style.color} 10%, transparent)`,
        color: style.color,
      }}
    >
      <Icon className="h-3 w-3" />
      <span>@{style.label}</span>
      {status === 'thinking' && (
        <span className="flex gap-0.5 ml-0.5">
          <span className="h-1 w-1 rounded-full animate-pulse" style={{ backgroundColor: style.color, animationDelay: '0ms' }} />
          <span className="h-1 w-1 rounded-full animate-pulse" style={{ backgroundColor: style.color, animationDelay: '150ms' }} />
          <span className="h-1 w-1 rounded-full animate-pulse" style={{ backgroundColor: style.color, animationDelay: '300ms' }} />
        </span>
      )}
    </div>
  );
}
