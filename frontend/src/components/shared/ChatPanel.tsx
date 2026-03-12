'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';

interface ChatPanelProps {
  moduleId: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatPanel({ moduleId }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    // TODO: Connect to backend SSE via ResilientSSEClient
    // Placeholder: echo back
    setMessages((prev) => [...prev, { role: 'assistant', content: 'Processing...' }]);
    setIsStreaming(false);
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
            >
              {msg.role === 'assistant' ? (
                <MarkdownViewer content={msg.content} />
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
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
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
