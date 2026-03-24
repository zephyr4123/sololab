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

  // Poll document processing status
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
    setUploadedDocs([]);  // 文件已附带到本次请求，清空标签
    setIsStreaming(true);
    ideaStore.reset();  // 重置 IdeaSpark 状态（新一轮生成）
    taskStore.setStatus('running');

    const client = new ResilientSSEClient();
    clientRef.current = client;

    // 传递 session_id 以复用已有会话（实现多轮对话）
    const currentSessionId = sessionStore.currentSessionId || undefined;

    // Pass doc_ids in params
    await client.start(moduleId, topic, { doc_ids: docIds }, {
      onTaskCreated: (sessionId) => {
        if (sessionId) sessionStore.setCurrentSession(sessionId);
        // 记录 taskId 以支持停止功能
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
    // 1. 通知后端取消任务
    const taskId = taskStore.activeTaskId || clientRef.current?.getTaskId();
    if (taskId) {
      try {
        await api.modules.stop(moduleId, taskId);
      } catch {
        // 取消请求失败不影响前端状态
      }
    }
    // 2. 中断 SSE 连接
    clientRef.current?.stop();
    // 3. 更新前端状态
    setIsStreaming(false);
    taskStore.setStatus('idle');
    ideaStore.setPhase('done');
    sessionStore.appendEventToLastEntry({ type: 'status', phase: 'cancelled' });
    sessionStore.fetchSessions(moduleId);
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
            <p className="mt-2 max-w-sm text-xs text-muted-foreground/60">
              支持上传 PDF 参考文献，让 AI 基于真实论文内容生成创意
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
        {/* Uploaded document tags */}
        {uploadedDocs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {uploadedDocs.map((doc) => (
              <div
                key={doc.filename}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                  doc.status === 'completed'
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : doc.status === 'failed'
                      ? 'border-red-200 bg-red-50 text-red-600'
                      : 'border-blue-200 bg-blue-50 text-blue-600'
                }`}
              >
                {doc.status === 'completed' ? (
                  <CheckCircle className="h-3 w-3" />
                ) : doc.status === 'failed' ? (
                  <X className="h-3 w-3" />
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                <FileText className="h-3 w-3" />
                <span className="max-w-[120px] truncate">{doc.filename}</span>
                <button
                  onClick={() => removeDoc(doc.filename)}
                  className="ml-0.5 rounded hover:bg-black/10 p-0.5"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="上传参考文献 (PDF)"
            disabled={isStreaming}
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.docx"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />

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
