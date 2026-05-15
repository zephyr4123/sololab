'use client';

/**
 * CodeLabContextStrip — top of the working surface, above the
 * three-column layout (messages center, sidebar right).
 *
 * Job mirrors `WriterContextStrip` and `CurtainContextStrip`:
 *
 *   1. Tell the user which workshop they're in:
 *        - phase eyebrow ("workshop · idle / drafting / running")
 *        - project name (display serif) + path chip (mono)
 *        - current agent (small badge) + cost meter
 *
 *   2. Two unambiguous escape hatches:
 *        - "切换项目" — drops back to ProjectStage (preserves recent list)
 *        - "+ 新会话" — starts a fresh session in the same project
 *
 * The pattern is now consistent across all three modules: every working
 * surface in SoloLab has a context strip with the same three jobs.
 */

import { ArrowLeftRight, Plus } from 'lucide-react';
import { getAgent } from '../shared/AgentMeta';

interface CodeLabContextStripProps {
  workingDirectory: string;
  currentAgent: string;
  agentStatus: 'idle' | 'thinking' | 'tool_call' | 'writing';
  costUsd: number;
  hasSession: boolean;
  onSwitchProject: () => void;
  onNewSession: () => void;
}

const STATUS_LABEL: Record<CodeLabContextStripProps['agentStatus'], { en: string; zh: string }> = {
  idle:      { en: 'idle',     zh: '空闲' },
  thinking:  { en: 'thinking', zh: '思考中' },
  tool_call: { en: 'working',  zh: '工作中' },
  writing:   { en: 'writing',  zh: '生成中' },
};

export function CodeLabContextStrip({
  workingDirectory, currentAgent, agentStatus, costUsd, hasSession,
  onSwitchProject, onNewSession,
}: CodeLabContextStripProps) {
  const dirName = workingDirectory.split('/').filter(Boolean).pop() ?? workingDirectory;
  const status = STATUS_LABEL[agentStatus];
  const agent = getAgent(currentAgent);
  const isLive = agentStatus !== 'idle';

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/30 px-6 py-3">
      {/* Left: phase eyebrow + status */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="atelier-eyebrow">workshop</span>
        <span aria-hidden className="h-px w-5 bg-warm/35" />
        <span
          className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground/55 tabular-nums"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {status.en}
        </span>
        {isLive && (
          <span
            className="ml-0.5 inline-flex h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: agent.color,
              animation: 'thinking-dot-bounce 1.4s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* Middle: project identity */}
      <div className="min-w-0 flex-1 flex items-baseline gap-3">
        <span
          className="truncate text-[13.5px] text-foreground/82 tracking-tight"
          style={{ fontFamily: 'var(--font-display)' }}
          title={workingDirectory}
        >
          {dirName}
        </span>
        <span
          className="hidden md:inline truncate text-[10.5px] text-muted-foreground/45 tabular-nums"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {workingDirectory}
        </span>
      </div>

      {/* Right: agent badge + cost + actions */}
      <div className="flex items-center gap-2 shrink-0">
        {isLive && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-medium tracking-tight"
            style={{
              color: agent.color,
              background: `color-mix(in oklab, ${agent.color} 12%, transparent)`,
              fontFamily: 'var(--font-sans)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, lineHeight: 1 }}>
              {agent.monogram}
            </span>
            @{agent.caps.toLowerCase()}
          </span>
        )}

        {costUsd > 0 && (
          <span
            className="hidden sm:inline rounded-full bg-card/50 px-2.5 py-1 text-[10.5px] tabular-nums text-muted-foreground/65"
            style={{ fontFamily: 'var(--font-mono)' }}
            title="累计费用"
          >
            ${costUsd.toFixed(4)}
          </span>
        )}

        {hasSession && (
          <button
            onClick={onNewSession}
            className="inline-flex items-center gap-1.5 rounded-full bg-warm/12 px-3.5 py-1.5 text-[11.5px] font-medium text-warm transition-colors hover:bg-warm/20"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
            新会话
          </button>
        )}

        <button
          onClick={onSwitchProject}
          className="inline-flex items-center gap-1.5 rounded-full bg-card/50 px-3.5 py-1.5 text-[11.5px] text-muted-foreground/75 transition-colors hover:bg-card hover:text-foreground/90"
          title="切换项目"
        >
          <ArrowLeftRight className="h-3 w-3" strokeWidth={2.2} />
          切换项目
        </button>
      </div>
    </div>
  );
}
