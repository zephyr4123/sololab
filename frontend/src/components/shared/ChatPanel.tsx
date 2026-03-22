'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';
import { ResilientSSEClient } from '@/lib/sse-client';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useTaskStore } from '@/stores/task-store';

interface ChatPanelProps {
  moduleId: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function ChatPanel({ moduleId }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<ResilientSSEClient | null>(null);
  const ideaStore = useIdeaSparkStore();
  const taskStore = useTaskStore();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    ideaStore.reset();
    taskStore.reset();

    const client = new ResilientSSEClient();
    clientRef.current = client;

    await client.start(moduleId, input, {}, {
      onStatus: (phase, round) => {
        ideaStore.setPhase(phase as any);
        if (round) ideaStore.setRound(round);
        setMessages((prev) => [...prev, {
          role: 'system',
          content: `**${phase}** ${round ? `(Round ${round})` : ''}`,
        }]);
      },
      onAgent: (agent, action, content) => {
        ideaStore.addAgentEvent({ agent, action, content });
      },
      onIdea: (id, content, author) => {
        ideaStore.addIdea({ id, content, author, eloScore: 1500 });
      },
      onVote: (ideaId, content, author, eloScore, rank) => {
        ideaStore.setTopIdeas([
          ...ideaStore.topIdeas,
          { id: ideaId, content, author, eloScore, rank, round: ideaStore.currentRound },
        ]);
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
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `Done! Generated **${topIdeas?.length || 0}** top ideas. Cost: $${costUsd?.toFixed(4) || '0'}`,
        }]);
      },
      onError: (message) => {
        taskStore.setStatus('failed');
        setIsStreaming(false);
        setMessages((prev) => [...prev, { role: 'system', content: `Error: ${message}` }]);
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
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : msg.role === 'system'
                  ? 'bg-accent text-accent-foreground text-xs'
                  : 'bg-muted'
              }`}
            >
              {msg.role === 'assistant' || msg.role === 'system' ? (
                <MarkdownViewer content={msg.content} />
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={`Enter research topic for ${moduleId}...`}
            className="flex-1 rounded-md border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="rounded-md bg-red-500 px-4 py-2 text-white hover:opacity-90"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
