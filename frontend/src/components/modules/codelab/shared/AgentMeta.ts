/**
 * AgentMeta — single source of truth for CodeLab's 4 workshop agents.
 *
 * CodeLab borrows IdeaSpark's monogram + caps pattern, but the
 * agents here are *craftsmen at workbenches*, not debating researchers.
 * Each gets a distinct rail colour so when several agents run in
 * parallel (ForkDiagram) the eye can pick them apart at a glance.
 *
 * Colours intentionally stay close-but-not-identical to the brand
 * warm. The Builder *is* the brand colour because Build is the
 * primary verb of the module; Explore / Plan / General are slight
 * spectral neighbours so a ForkDiagram of four spokes reads as a
 * tonal chord, not a rainbow.
 */

export type AgentId = 'build' | 'explore' | 'plan' | 'general';

export interface AgentMeta {
  id: AgentId;
  monogram: string;
  caps: string;
  zh: string;
  /** Hex used for tool rails, spoke colours, dots. Same in both themes. */
  color: string;
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  build:   { id: 'build',   monogram: '⬢', caps: 'BUILD',    zh: '执行', color: '#B8956A' },
  explore: { id: 'explore', monogram: '⊙', caps: 'EXPLORE',  zh: '探索', color: '#4B7BB5' },
  plan:    { id: 'plan',    monogram: '◈', caps: 'PLAN',     zh: '规划', color: '#7B6FA0' },
  general: { id: 'general', monogram: '⊕', caps: 'GENERAL',  zh: '通用', color: '#8B847C' },
};

const FALLBACK: AgentMeta = {
  id: 'general',
  monogram: '·',
  caps: 'AGENT',
  zh: '智能体',
  color: '#A8A29E',
};

export function getAgent(id: string | undefined | null): AgentMeta {
  if (!id) return FALLBACK;
  return (AGENTS as Record<string, AgentMeta>)[id] ?? FALLBACK;
}

export function agentColor(id: string | undefined | null): string {
  return getAgent(id).color;
}
