'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Send, Loader2, Square } from 'lucide-react';
import { StreamRenderer } from '@/components/shared/StreamRenderer';
import { ResilientSSEClient } from '@/lib/sse-client';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useTaskStore } from '@/stores/task-store';
import { useSessionStore } from '@/stores/session-store';

interface ChatPanelProps {
  moduleId: string;
}

export function ChatPanel({ moduleId }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<ResilientSSEClient | null>(null);
  const ideaStore = useIdeaSparkStore();
  const taskStore = useTaskStore();
  const sessionStore = useSessionStore();
  const entries = sessionStore.chatEntries;

  // Auto-scroll when entries change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const topic = input.trim();

    // Add user bubble + empty stream entry to store
    sessionStore.appendChatEntry({ kind: 'user', userText: topic });
    sessionStore.appendChatEntry({ kind: 'stream', events: [] });
    setInput('');
    setIsStreaming(true);
    ideaStore.reset();
    taskStore.reset();

    const client = new ResilientSSEClient();
    clientRef.current = client;

    await client.start(moduleId, topic, {}, {
      onTaskCreated: (sessionId) => {
        if (sessionId) {
          sessionStore.setCurrentSession(sessionId);
        }
      },
      onStatus: (phase, round) => {
        ideaStore.setPhase(phase as any);
        if (round) ideaStore.setRound(round);
        sessionStore.appendEventToLastEntry({ type: 'status', phase, round });
      },
      onAgent: (agent, action, content, messageCount) => {
        ideaStore.addAgentEvent({ agent, action, content });
        sessionStore.appendEventToLastEntry({ type: 'agent', agent, action, content, message_count: messageCount });
      },
      onTool: (event) => {
        sessionStore.appendEventToLastEntry(event);
      },
      onIdea: (id, content, author) => {
        ideaStore.addIdea({ id, content, author, eloScore: 1500 });
        sessionStore.appendEventToLastEntry({ type: 'idea', id, content, author });
      },
      onVote: (ideaId, content, author, eloScore, rank) => {
        ideaStore.setTopIdeas([
          ...ideaStore.topIdeas,
          { id: ideaId, content, author, eloScore, rank, round: ideaStore.currentRound },
        ]);
        sessionStore.appendEventToLastEntry({ type: 'vote', idea_id: ideaId, content, author, elo_score: eloScore, rank });
      },
      onDone: (topIdeas, costUsd) => {
        if (topIdeas) {
          ideaStore.setTopIdeas(topIdeas.map((t, i) => ({
            id: t.id,
            content: t.content,
            author: t.author,
            eloScore: t.elo_score,
            rank: i + 1,
            round: ideaStore.currentRound,
          })));
        }
        if (costUsd) ideaStore.setCostUsd(costUsd);
        ideaStore.setPhase('done');
        taskStore.setStatus('completed');
        setIsStreaming(false);
        sessionStore.appendEventToLastEntry({ type: 'done', top_ideas: topIdeas, cost_usd: costUsd });
        // Refresh session list to show the new conversation
        sessionStore.fetchSessions(moduleId);
      },
      onError: (message) => {
        taskStore.setStatus('failed');
        setIsStreaming(false);
        sessionStore.appendEventToLastEntry({ type: 'error', message });
        sessionStore.fetchSessions(moduleId);
      },
      onReconnecting: () => {
        taskStore.setStatus('reconnecting');
      },
    });
  };

  const handleStop = () => {
    clientRef.current?.stop();
    setIsStreaming(false);
    taskStore.setStatus('idle');
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Scrollable chat area */}
      <div className="flex-1 overflow-y-auto p-4">
        {entries.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Image src="/logo.png" alt="SoloLab" width={80} height={80} className="mb-4 h-20 w-auto object-contain opacity-80" />
            <h3 className="mb-1 text-lg font-semibold text-foreground">IdeaSpark</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              输入研究主题，多智能体将协作生成创新性研究创意。
            </p>
          </div>
        )}

        <div className="space-y-4">
          {entries.map((entry, i) => {
            if (entry.kind === 'user') {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                    {entry.userText}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="w-full">
                <StreamRenderer events={entry.events || []} />
              </div>
            );
          })}
        </div>

        {isStreaming && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>智能体正在协作中...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t bg-background p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder='输入研究主题，例如："如何用 LLM 改进跨学科研究协作"'
            rows={1}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border bg-background px-4 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white transition-colors hover:bg-red-600"
              title="Stop"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
