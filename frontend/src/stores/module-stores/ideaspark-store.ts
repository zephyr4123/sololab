import { create } from 'zustand';

interface Idea {
  id: string;
  content: string;
  author: string;
  eloScore: number;
  round: number;
}

interface IdeaSparkState {
  ideas: Idea[];
  topIdeas: Idea[];
  currentRound: number;
  phase: 'idle' | 'separate' | 'together' | 'evaluate' | 'done';
  addIdea: (idea: Idea) => void;
  setTopIdeas: (ideas: Idea[]) => void;
  setPhase: (phase: IdeaSparkState['phase']) => void;
  setRound: (round: number) => void;
  reset: () => void;
}

export const useIdeaSparkStore = create<IdeaSparkState>((set) => ({
  ideas: [],
  topIdeas: [],
  currentRound: 0,
  phase: 'idle',
  addIdea: (idea) => set((s) => ({ ideas: [...s.ideas, idea] })),
  setTopIdeas: (ideas) => set({ topIdeas: ideas }),
  setPhase: (phase) => set({ phase }),
  setRound: (round) => set({ currentRound: round }),
  reset: () => set({ ideas: [], topIdeas: [], currentRound: 0, phase: 'idle' }),
}));
