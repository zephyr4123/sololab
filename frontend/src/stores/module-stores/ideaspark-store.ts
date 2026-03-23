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

interface IdeaSparkState {
  ideas: Idea[];
  topIdeas: Idea[];
  agentEvents: AgentEvent[];
  currentRound: number;
  phase: 'idle' | 'separate' | 'cluster' | 'together' | 'synthesize' | 'evaluate' | 'converged' | 'done';
  costUsd: number;
  addIdea: (idea: Omit<Idea, 'round'>) => void;
  setTopIdeas: (ideas: Idea[]) => void;
  addAgentEvent: (event: Omit<AgentEvent, 'timestamp'>) => void;
  setPhase: (phase: IdeaSparkState['phase']) => void;
  setRound: (round: number) => void;
  setCostUsd: (cost: number) => void;
  restoreFromHistory: (events: any[]) => void;
  reset: () => void;
}

export const useIdeaSparkStore = create<IdeaSparkState>((set, get) => ({
  ideas: [],
  topIdeas: [],
  agentEvents: [],
  currentRound: 0,
  phase: 'idle',
  costUsd: 0,
  addIdea: (idea) =>
    set((s) => ({ ideas: [...s.ideas, { ...idea, round: s.currentRound }] })),
  setTopIdeas: (ideas) => set({ topIdeas: ideas }),
  addAgentEvent: (event) =>
    set((s) => ({ agentEvents: [...s.agentEvents, { ...event, timestamp: Date.now() }] })),
  setPhase: (phase) => set({ phase }),
  setRound: (round) => set({ currentRound: round }),
  setCostUsd: (cost) => set({ costUsd: cost }),
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
    set({ ideas: [], topIdeas: [], agentEvents: [], currentRound: 0, phase: 'idle', costUsd: 0 }),
}));
