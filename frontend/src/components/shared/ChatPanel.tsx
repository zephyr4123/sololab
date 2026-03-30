'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Send, Loader2, Square, Paperclip, X, FileText, CheckCircle } from 'lucide-react';
import { StreamRenderer } from '@/components/shared/StreamRenderer';
import { ResilientSSEClient } from '@/lib/sse-client';
import { useIdeaSparkStore } from '@/stores/module-stores/ideaspark-store';
import { useTaskStore } from '@/stores/task-store';
import { useSessionStore } from '@/stores/session-store';
import { documentApi, api } from '@/lib/api-client';

interface ChatPanelProps {
  moduleId: string;
}

interface UploadedDoc {
  docId: string;
  filename: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
}

export function ChatPanel({ moduleId }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<ResilientSSEClient | null>(null);
  const ideaStore = useIdeaSparkStore();
  const taskStore = useTaskStore();
  const sessionStore = useSessionStore();
  const entries = sessionStore.chatEntries;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const pollDocStatus = useCallback(async (docId: string) => {
    const poll = async () => {
      try {
        const status = await documentApi.getStatus(docId);
        setUploadedDocs(prev =>
          prev.map(d => d.docId === docId ? { ...d, status: status.status } : d)
        );
        if (status.status === 'processing' || status.status === 'pending') {
          setTimeout(poll, 2000);
        }
      } catch { /* ignore */ }
    };
    poll();
  }, []);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const tempDoc: UploadedDoc = { docId: '', filename: file.name, status: 'uploading' };
      setUploadedDocs(prev => [...prev, tempDoc]);
      try {
        const result = await documentApi.upload(file);
        setUploadedDocs(prev =>
          prev.map(d => d.filename === file.name && d.status === 'uploading'
            ? { ...d, docId: result.doc_id, status: 'processing' }
            : d
          )
        );
        pollDocStatus(result.doc_id);
      } catch {
        setUploadedDocs(prev =>
          prev.map(d => d.filename === file.name && d.status === 'uploading'
            ? { ...d, status: 'failed' }
            : d
          )
        );
      }
    }
  };

  const removeDoc = (filename: string) => {
    setUploadedDocs(prev => prev.filter(d => d.filename !== filename));
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const topic = input.trim();
    const docIds = uploadedDocs
      .filter(d => d.status === 'completed' && d.docId)
      .map(d => d.docId);

    sessionStore.appendChatEntry({ kind: 'user', userText: topic });
    sessionStore.appendChatEntry({ kind: 'stream', events: [] });
    setInput('');
    setUploadedDocs([]);
    setIsStreaming(true);
    ideaStore.reset();
    taskStore.setStatus('running');

    const client = new ResilientSSEClient();
    clientRef.current = client;
    const currentSessionId = sessionStore.currentSessionId || undefined;

    await client.start(moduleId, topic, { doc_ids: docIds }, {
      onTaskCreated: (sessionId) => {
        if (sessionId) sessionStore.setCurrentSession(sessionId);
        const taskId = client.getTaskId();
        if (taskId) taskStore.setActiveTask(taskId);
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
            id: t.id, content: t.content, author: t.author,
            eloScore: t.elo_score, rank: i + 1, round: ideaStore.currentRound,
          })));
        }
        if (costUsd) ideaStore.setCostUsd(costUsd);
        ideaStore.setPhase('done');
        taskStore.setStatus('completed');
        setIsStreaming(false);
        sessionStore.appendEventToLastEntry({ type: 'done', top_ideas: topIdeas, cost_usd: costUsd });
        sessionStore.fetchSessions(moduleId);
      },
      onError: (message) => {
        taskStore.setStatus('failed');
        setIsStreaming(false);
        sessionStore.appendEventToLastEntry({ type: 'error', message });
        sessionStore.fetchSessions(moduleId);
      },
      onReconnecting: () => { taskStore.setStatus('reconnecting'); },
    }, currentSessionId);
  };

  const handleStop = async () => {
    const taskId = taskStore.activeTaskId || clientRef.current?.getTaskId();
    if (taskId) {
      try { await api.modules.stop(moduleId, taskId); } catch {}
    }
    clientRef.current?.stop();
    setIsStreaming(false);
    taskStore.setStatus('idle');
    ideaStore.setPhase('done');
    sessionStore.appendEventToLastEntry({ type: 'status', phase: 'cancelled' });
    sessionStore.fetchSessions(moduleId);
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Scrollable chat area */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {entries.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center animate-fade-in">
            <Image src="/logo.png" alt="SoloLab" width={56} height={56} className="mb-5 h-14 w-auto object-contain opacity-60" />
            <h3 className="mb-1.5 text-lg font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              IdeaSpark
            </h3>
            <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground/70">
              输入研究主题，多智能体将协作生成创新性研究创意
            </p>
            <p className="mt-2.5 max-w-xs text-[11px] text-muted-foreground/40">
              支持上传 PDF 参考文献，让 AI 基于论文内容生成创意
            </p>
          </div>
        )}

        <div className="space-y-4">
          {entries.map((entry, i) => {
            if (entry.kind === 'user') {
              return (
                <div key={i} className="flex justify-end animate-fade-in-up">
                  <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-foreground/[0.07] px-4 py-2.5 text-sm leading-relaxed">
                    {entry.userText}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="w-full animate-fade-in">
                <StreamRenderer events={entry.events || []} />
              </div>
            );
          })}
        </div>

        {isStreaming && (
          <div className="mt-4 flex items-center gap-2.5 text-xs text-muted-foreground/60">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warm)] animate-pulse" />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warm)] animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warm)] animate-pulse" style={{ animationDelay: '300ms' }} />
            </span>
            <span className="tracking-wide">智能体协作中</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area — unified container */}
      <div className="bg-background/80 backdrop-blur-sm px-3 py-3">
        <div className="rounded-2xl border border-border/50 bg-card/50 transition-all duration-200 focus-within:border-[var(--color-warm)]/30 focus-within:bg-card/80 focus-within:shadow-[0_0_0_1px_var(--color-warm)]/10">
          {/* Uploaded document tags — inside the container */}
          {uploadedDocs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
              {uploadedDocs.map((doc) => (
                <div
                  key={doc.filename}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    doc.status === 'completed'
                      ? 'border-[var(--color-warm)]/20 bg-[var(--color-warm)]/5 text-[var(--color-warm)]'
                      : doc.status === 'failed'
                        ? 'border-destructive/20 bg-destructive/5 text-destructive'
                        : 'border-border bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {doc.status === 'completed' ? (
                    <CheckCircle className="h-2.5 w-2.5" />
                  ) : doc.status === 'failed' ? (
                    <X className="h-2.5 w-2.5" />
                  ) : (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  )}
                  <FileText className="h-2.5 w-2.5" />
                  <span className="max-w-[100px] truncate">{doc.filename}</span>
                  <button onClick={() => removeDoc(doc.filename)} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10">
                    <X className="h-2 w-2" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入研究主题..."
            rows={1}
            className="w-full max-h-32 min-h-[40px] resize-none bg-transparent px-4 pt-3 pb-1 text-sm leading-relaxed placeholder:text-muted-foreground/35 focus:outline-none"
            disabled={isStreaming}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.docx"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />

          {/* Bottom bar — attach left, send right */}
          <div className="flex items-center justify-between px-3 pb-2.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/35 transition-colors hover:text-muted-foreground/70 hover:bg-foreground/[0.04]"
              title="上传参考文献 (PDF)"
              disabled={isStreaming}
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {isStreaming ? (
              <button
                onClick={handleStop}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/8 text-foreground/50 transition-colors hover:bg-foreground/12"
                title="Stop"
              >
                <Square className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-warm)]/15 text-[var(--color-warm)] transition-all hover:bg-[var(--color-warm)]/25 disabled:opacity-20"
                title="Send (Enter)"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
