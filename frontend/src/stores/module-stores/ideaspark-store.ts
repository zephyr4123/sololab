import { create } from 'zustand';

interface Idea {
  id: string;
  content: string;
  author: string;
  eloScore: number;
  rank?: number;
  round: number;
}

interface AgentEvent {
  agent: string;
  action: string;
  content?: string;
  timestamp: number;
}

export type IdeaSparkMode = 'fast' | 'deep';

interface IdeaSparkState {
  ideas: Idea[];
  topIdeas: Idea[];
  agentEvents: AgentEvent[];
  currentRound: number;
  phase: 'idle' | 'separate' | 'cluster' | 'together' | 'synthesize' | 'evaluate' | 'converged' | 'done' | 'cancelled';
  costUsd: number;
  /** 执行模式：fast = 单轮速跑 ~5 分钟；deep = 3 轮深辩 ~25 分钟。 */
  mode: IdeaSparkMode;
  addIdea: (idea: Omit<Idea, 'round'>) => void;
  setTopIdeas: (ideas: Idea[]) => void;
  addAgentEvent: (event: Omit<AgentEvent, 'timestamp'>) => void;
  setPhase: (phase: IdeaSparkState['phase']) => void;
  setRound: (round: number) => void;
  setCostUsd: (cost: number) => void;
  setMode: (mode: IdeaSparkMode) => void;
  restoreFromHistory: (events: any[]) => void;
  reset: () => void;
}

export const useIdeaSparkStore = create<IdeaSparkState>((set, _get) => ({
  ideas: [],
  topIdeas: [],
  agentEvents: [],
  currentRound: 0,
  phase: 'idle',
  costUsd: 0,
  mode: 'fast',
  addIdea: (idea) =>
    set((s) => ({ ideas: [...s.ideas, { ...idea, round: s.currentRound }] })),
  setTopIdeas: (ideas) => set({ topIdeas: ideas }),
  addAgentEvent: (event) =>
    set((s) => ({ agentEvents: [...s.agentEvents, { ...event, timestamp: Date.now() }] })),
  setPhase: (phase) => set({ phase }),
  setRound: (round) => set({ currentRound: round }),
  setCostUsd: (cost) => set({ costUsd: cost }),
  setMode: (mode) => set({ mode }),
  restoreFromHistory: (events) => {
    const ideas: Idea[] = [];
    const agentEvents: AgentEvent[] = [];
    let topIdeas: Idea[] = [];
    let costUsd = 0;
    let currentRound = 0;
    let phase: IdeaSparkState['phase'] = 'done';

    for (const event of events) {
      if (event.type === 'idea') {
        ideas.push({
          id: event.id,
          content: event.content,
          author: event.author,
          eloScore: 1500,
          round: currentRound,
        });
      }
      if (event.type === 'agent' && event.content) {
        agentEvents.push({
          agent: event.agent,
          action: event.action,
          content: event.content,
          timestamp: Date.now(),
        });
      }
      if (event.type === 'vote') {
        // Accumulate votes — final topIdeas comes from done event
      }
      if (event.type === 'status' && event.round) {
        currentRound = event.round;
      }
      if (event.type === 'done') {
        if (event.top_ideas) {
          topIdeas = event.top_ideas.map((t: any, i: number) => ({
            id: t.id,
            content: t.content,
            author: t.author,
            eloScore: t.elo_score,
            rank: i + 1,
            round: currentRound,
          }));
        }
        costUsd = event.cost_usd || 0;
        phase = 'done';
      }
    }

    set({ ideas, topIdeas, agentEvents, currentRound, phase, costUsd });
  },
  reset: () =>
    set((s) => ({
      ideas: [],
      topIdeas: [],
      agentEvents: [],
      currentRound: 0,
      phase: 'idle',
      costUsd: 0,
      // mode 由用户上一次选择决定，reset 不动；用户没主动改就保持上次的偏好
      mode: s.mode,
    })),
}));
