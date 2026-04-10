'use client';

import { create } from 'zustand';

/* ── Types ── */

export interface WriterSection {
  id: string;
  type: string;
  title: string;
  content: string;
  order: number;
  status: 'empty' | 'writing' | 'complete';
  wordCount: number;
}

export interface WriterReference {
  number: number;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
}

export interface WriterFigure {
  id: string;
  sectionId?: string;
  caption: string;
  url: string;
  code?: string;
  order: number;
  number?: number;
}

export type WriterPhase = 'idle' | 'writing' | 'complete';

export interface AgentStatus {
  action: string; // thinking | searching | writing | coding | done
  content?: string;
}

/* ── Chat entries ── */

export interface WriterChatEntry {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
  toolStatus?: string;
}

/* ── Store ── */

interface WriterState {
  // Document
  docId: string | null;
  title: string;
  templateId: string;
  language: string;
  phase: WriterPhase;
  sections: WriterSection[];
  references: WriterReference[];
  figures: WriterFigure[];
  wordCount: number;
  costUsd: number;

  // Streaming
  streamingSectionId: string | null;

  // Agent
  agentStatus: AgentStatus | null;
  isStreaming: boolean;

  // Chat
  chatEntries: WriterChatEntry[];

  // UI
  selectedSectionId: string | null;
  isExporting: boolean;
}

interface WriterActions {
  // Document
  setDocId: (id: string) => void;
  setTitle: (title: string) => void;
  setTemplateId: (id: string) => void;
  setPhase: (phase: WriterPhase) => void;
  setCostUsd: (cost: number) => void;

  // Sections
  initSections: (sections: WriterSection[]) => void;
  startSectionStream: (sectionId: string) => void;
  appendStreamDelta: (sectionId: string, delta: string) => void;
  completeSection: (sectionId: string, wordCount: number) => void;

  // References & Figures
  addReference: (ref: WriterReference) => void;
  removeReference: (refNumber: number) => void;
  addFigure: (fig: WriterFigure) => void;

  // Agent
  setAgentStatus: (status: AgentStatus | null) => void;
  setIsStreaming: (v: boolean) => void;

  // Chat
  addChatEntry: (entry: WriterChatEntry) => void;

  // UI
  setSelectedSection: (id: string | null) => void;
  setIsExporting: (v: boolean) => void;

  // Lifecycle
  restoreFromDocument: (doc: Record<string, unknown>) => void;
  reset: () => void;
}

const initialState: WriterState = {
  docId: null,
  title: '',
  templateId: 'nature',
  language: 'auto',
  phase: 'idle',
  sections: [],
  references: [],
  figures: [],
  wordCount: 0,
  costUsd: 0,
  streamingSectionId: null,
  agentStatus: null,
  isStreaming: false,
  chatEntries: [],
  selectedSectionId: null,
  isExporting: false,
};

export const useWriterStore = create<WriterState & WriterActions>((set, get) => ({
  ...initialState,

  // ── Document ──
  setDocId: (id) => set({ docId: id }),
  setTitle: (title) => set({ title }),
  setTemplateId: (id) => set({ templateId: id }),
  setPhase: (phase) => set({ phase }),
  setCostUsd: (cost) => set({ costUsd: cost }),

  // ── Sections ──
  initSections: (sections) =>
    set({
      sections,
      phase: 'writing',
      wordCount: sections.reduce((s, sec) => s + sec.wordCount, 0),
    }),

  startSectionStream: (sectionId) =>
    set((state) => ({
      streamingSectionId: sectionId,
      sections: state.sections.map((s) =>
        s.id === sectionId ? { ...s, status: 'writing' as const, content: '' } : s
      ),
    })),

  appendStreamDelta: (sectionId, delta) =>
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === sectionId ? { ...s, content: s.content + delta } : s
      ),
    })),

  completeSection: (sectionId, wordCount) =>
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, status: 'complete' as const, wordCount } : s
      );
      return {
        sections,
        streamingSectionId: null,
        wordCount: sections.reduce((sum, s) => sum + s.wordCount, 0),
      };
    }),

  // ── References ──
  addReference: (ref) =>
    set((state) => ({ references: [...state.references, ref] })),

  removeReference: (refNumber) =>
    set((state) => ({
      references: state.references
        .filter((r) => r.number !== refNumber)
        .map((r, i) => ({ ...r, number: i + 1 })),
    })),

  // ── Figures ──
  addFigure: (fig) =>
    set((state) => ({ figures: [...state.figures, fig] })),

  // ── Agent ──
  setAgentStatus: (status) => set({ agentStatus: status }),
  setIsStreaming: (v) => set({ isStreaming: v }),

  // ── Chat ──
  addChatEntry: (entry) =>
    set((state) => ({ chatEntries: [...state.chatEntries, entry] })),

  // ── UI ──
  setSelectedSection: (id) => set({ selectedSectionId: id }),
  setIsExporting: (v) => set({ isExporting: v }),

  // ── Lifecycle ──
  restoreFromDocument: (doc) =>
    set({
      docId: (doc.doc_id as string) || null,
      title: (doc.title as string) || '',
      templateId: (doc.template_id as string) || 'nature',
      language: (doc.language as string) || 'en',
      phase: doc.status === 'complete' ? 'complete' : doc.status === 'writing' ? 'writing' : 'idle',
      sections: ((doc.sections as WriterSection[]) || []).map((s) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        content: s.content || '',
        order: s.order,
        status: (s.status as WriterSection['status']) || 'empty',
        wordCount: s.wordCount || (s as unknown as Record<string, unknown>).word_count as number || 0,
      })),
      references: (doc.references as WriterReference[]) || [],
      figures: (doc.figures as WriterFigure[]) || [],
      wordCount: (doc.word_count as number) || 0,
    }),

  reset: () => set(initialState),
}));
