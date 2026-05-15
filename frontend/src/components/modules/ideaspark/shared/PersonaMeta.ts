/**
 * PersonaMeta — single source of truth for the 5 IdeaSpark personas.
 *
 * Color-by-agent is intentionally removed. Personas are distinguished by
 * monogram glyph + caps label + role description. Greyscale + a single
 * warm accent carries the whole module, in the spirit of Writer.
 */

export type PersonaId =
  | 'divergent'
  | 'expert'
  | 'critic'
  | 'connector'
  | 'evaluator';

export interface PersonaMeta {
  id: PersonaId;
  monogram: string;
  caps: string;
  zh: string;
  role: string;
}

export const PERSONAS: Record<PersonaId, PersonaMeta> = {
  divergent: { id: 'divergent', monogram: '✦', caps: 'DIVERGENT', zh: '发散者', role: '提出新颖角度' },
  expert: { id: 'expert', monogram: '◇', caps: 'EXPERT', zh: '领域专家', role: '基于领域知识' },
  critic: { id: 'critic', monogram: '⌁', caps: 'CRITIC', zh: '审辩者', role: '审辩与改进' },
  connector: { id: 'connector', monogram: '⌗', caps: 'CONNECTOR', zh: '整合者', role: '整合多方观点' },
  evaluator: { id: 'evaluator', monogram: '⚖', caps: 'EVALUATOR', zh: '评审者', role: '评估并打分' },
};

export function getPersona(id: string | undefined | null): PersonaMeta | null {
  if (!id) return null;
  return (PERSONAS as Record<string, PersonaMeta>)[id] ?? null;
}

export function personaLabel(id: string | undefined | null): string {
  return getPersona(id)?.zh ?? id ?? '';
}

/* ── Phase labels (mirrors backend phase ids) ── */
export type PhaseId = 'separate' | 'cluster' | 'together' | 'synthesize' | 'evaluate' | 'converged' | 'done' | 'cancelled';

export const PHASE_ORDER: PhaseId[] = ['separate', 'together', 'synthesize', 'evaluate'];

export const PHASE_META: Record<PhaseId, { caps: string; zh: string; subtitle: string }> = {
  separate: { caps: 'PHASE I · SEPARATE', zh: '并行发散', subtitle: '5 个智能体独立检索文献并提出方向' },
  cluster: { caps: 'PHASE · CLUSTER', zh: '方向聚类', subtitle: '按相似度合并候选' },
  together: { caps: 'PHASE II · TOGETHER', zh: '协同评议', subtitle: '审辩与整合的来回讨论' },
  synthesize: { caps: 'PHASE III · SYNTHESIZE', zh: '全局整合', subtitle: '收敛为更优候选' },
  evaluate: { caps: 'PHASE IV · RANKING', zh: 'Elo 排序', subtitle: '成对评估并排序' },
  converged: { caps: 'CURTAIN', zh: '已完成', subtitle: '' },
  done: { caps: 'CURTAIN', zh: '已完成', subtitle: '' },
  cancelled: { caps: 'CANCELLED', zh: '已取消', subtitle: '' },
};

/* ── Roman numerals helper for stage headers ── */
export function phaseRoman(phase: PhaseId): string {
  const idx = PHASE_ORDER.indexOf(phase);
  if (idx < 0) return '';
  return ['I', 'II', 'III', 'IV'][idx] ?? '';
}
