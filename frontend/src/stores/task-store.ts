import { create } from 'zustand';

interface TaskState {
  activeTaskId: string | null;
  lastEventId: number;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'reconnecting';
  setActiveTask: (taskId: string) => void;
  setLastEventId: (id: number) => void;
  setStatus: (status: TaskState['status']) => void;
  reset: () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  activeTaskId: null,
  lastEventId: 0,
  status: 'idle',
  setActiveTask: (taskId) => set({ activeTaskId: taskId, status: 'running' }),
  setLastEventId: (id) => set({ lastEventId: id }),
  setStatus: (status) => set({ status }),
  reset: () => set({ activeTaskId: null, lastEventId: 0, status: 'idle' }),
}));
