'use client';

import { create } from 'zustand';
import { writerApi } from '@/lib/api-client';

const LAST_DOC_KEY = 'sololab.writer.lastDocId';

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

export interface WriterSearchResultItem {
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  url: string;
  abstract: string;
  source: string;
}

export interface WriterChatEntry {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
  toolStatus?: string;
  toolInput?: Record<string, unknown>;
  toolDetail?: string;
  toolResults?: WriterSearchResultItem[];
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
  setSectionContent: (sectionId: string, content: string) => void;

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
  loadDocument: (docId: string) => Promise<boolean>;
  loadLastDocument: () => Promise<void>;
  newDocument: () => void;
  reset: () => void;
}

/* ── Helpers ── */

function persistDocId(docId: string | null): void {
  if (typeof window === 'undefined') return;
  if (docId) {
    window.localStorage.setItem(LAST_DOC_KEY, docId);
  } else {
    window.localStorage.removeItem(LAST_DOC_KEY);
  }
}

function readPersistedDocId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LAST_DOC_KEY);
}

/**
 * Convert the persisted OpenAI-format `conversation` field into the
 * frontend's flat `chatEntries` shape. We only render user/assistant text and
 * tool-call markers — raw `tool` role messages (the actual tool results) are
 * dropped because they're internal context, not user-visible chat.
 */
function conversationToChatEntries(
  conversation: Array<{ messages?: Array<Record<string, unknown>>; timestamp?: string }>
): WriterChatEntry[] {
  const entries: WriterChatEntry[] = [];
  let counter = 0;
  const turns = conversation || [];
  for (const turn of turns) {
    const msgs = turn?.messages || [];
    const baseTime = turn?.timestamp ? new Date(turn.timestamp).getTime() : Date.now();
    for (const msg of msgs) {
      counter += 1;
      const id = `restored-${baseTime}-${counter}`;
      const role = msg.role as string;
      if (role === 'user') {
        entries.push({
          id,
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : '',
          timestamp: baseTime,
        });
      } else if (role === 'assistant') {
        const content = typeof msg.content === 'string' ? msg.content : '';
        if (content.trim()) {
          entries.push({ id, role: 'assistant', content, timestamp: baseTime });
        }
        const toolCalls = (msg.tool_calls as Array<Record<string, unknown>>) || [];
        for (const tc of toolCalls) {
          const fn = (tc.function as Record<string, unknown>) || {};
          const toolName = (fn.name as string) || 'unknown';
          let parsedInput: Record<string, unknown> | undefined;
          try {
            const argsStr = fn.arguments as string;
            parsedInput = argsStr ? JSON.parse(argsStr) : undefined;
          } catch {
            parsedInput = undefined;
          }
          entries.push({
            id: `${id}-${toolName}`,
            role: 'tool',
            content: '',
            timestamp: baseTime,
            toolName,
            toolStatus: 'complete',
            toolInput: parsedInput,
            toolDetail:
              (parsedInput?.query as string) ||
              (parsedInput?.section_id as string) ||
              (parsedInput?.title as string) ||
              undefined,
          });
        }
      }
      // role === 'tool': skip (raw tool results aren't shown in chat history)
    }
  }
  return entries;
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
  setDocId: (id) => {
    persistDocId(id || null);
    set({ docId: id });
  },
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

  setSectionContent: (sectionId, content) =>
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === sectionId ? { ...s, content } : s
      ),
    })),

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
  restoreFromDocument: (doc) => {
    const docId = (doc.doc_id as string) || null;
    persistDocId(docId);
    const sectionsRaw = (doc.sections as Array<Record<string, unknown>>) || [];
    set({
      docId,
      title: (doc.title as string) || '',
      templateId: (doc.template_id as string) || 'nature',
      language: (doc.language as string) || 'en',
      phase: doc.status === 'complete' ? 'complete' : doc.status === 'writing' ? 'writing' : 'idle',
      sections: sectionsRaw.map((s) => ({
        id: s.id as string,
        type: s.type as string,
        title: s.title as string,
        content: (s.content as string) || '',
        order: s.order as number,
        status: ((s.status as WriterSection['status']) || 'empty') as WriterSection['status'],
        wordCount: (s.wordCount as number) || (s.word_count as number) || 0,
      })),
      references: (doc.references as WriterReference[]) || [],
      figures: ((doc.figures as Array<Record<string, unknown>>) || []).map((f) => ({
        id: (f.id as string) || '',
        sectionId: (f.section_id as string) || (f.sectionId as string),
        caption: (f.caption as string) || '',
        url: (f.url as string) || '',
        code: f.code as string | undefined,
        order: (f.order as number) || 0,
        number: f.number as number | undefined,
      })),
      wordCount: (doc.word_count as number) || 0,
      chatEntries: conversationToChatEntries(
        (doc.conversation as Array<{ messages?: Array<Record<string, unknown>>; timestamp?: string }>) || []
      ),
      streamingSectionId: null,
      agentStatus: null,
      isStreaming: false,
      isExporting: false,
    });
  },

  loadDocument: async (docId) => {
    try {
      const doc = await writerApi.getDocument(docId);
      get().restoreFromDocument(doc);
      return true;
    } catch (e) {
      console.error('Failed to load document', docId, e);
      return false;
    }
  },

  loadLastDocument: async () => {
    const last = readPersistedDocId();
    if (!last) return;
    await get().loadDocument(last);
  },

  newDocument: () => {
    persistDocId(null);
    set(initialState);
  },

  reset: () => {
    persistDocId(null);
    set(initialState);
  },
}));
