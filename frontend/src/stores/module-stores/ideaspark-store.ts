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
  reset: () =>
    set({ ideas: [], topIdeas: [], agentEvents: [], currentRound: 0, phase: 'idle', costUsd: 0 }),
}));
