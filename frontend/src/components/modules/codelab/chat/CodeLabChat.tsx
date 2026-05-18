'use client';

/**
 * CodeLabChat — module entry point + working-surface controller.
 *
 * Two surfaces (mirrors IdeaSpark / Writer pattern):
 *
 *   STAGE  (no workingDirectory):
 *     → ProjectStage (workshop hero with recent + browse)
 *
 *   CHAT   (workingDirectory selected):
 *     → CodeLabContextStrip   (top bar — project identity + actions)
 *       ChatEmptyState        (when zero messages)
 *       ChatMessage[]         (interleaved user + assistant)
 *       ChatComposer          (input + skill picker)
 *
 * The streaming lifecycle owns four hard rules — they're easy to get
 * subtly wrong, hence the dedicated `endActiveStream` helper:
 *
 *   1. Switching project  → abort SSE *and* tell OpenCode to stop (or it
 *      keeps burning tokens server-side until the prompt naturally finishes).
 *   2. Starting a new session → same.
 *   3. Component unmount → same (user navigated away mid-stream).
 *   4. User pressed Stop → same.
 *
 * Subtler trap, equally non-negotiable: every SSE handler reads the *current*
 * store via `useCodeLabStore.getState()`. Reading through the closed-over
 * `store` reference is a snapshot at handler-creation time — once `onAgent`
 * advances `currentAgent`, a subsequent `onText` would otherwise overwrite
 * it back to the stale value.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCodeLabStore } from '@/stores/module-stores/codelab-store';
import type { MessagePart, ParallelTaskGroup } from '@/stores/module-stores/codelab-store';
import { opencode, streamPrompt } from '@/lib/opencode-client';
import type { OpenCodeStreamHandlers, OcSkillEntry } from '@/lib/opencode-client';
import { codelabSessionApi } from '@/lib/api-client';
import { extractFilePath, toolFileStatus } from '../shared/ToolMeta';
import { ProjectStage } from '../stage/ProjectStage';
import { CodeLabContextStrip } from './CodeLabContextStrip';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessage } from './ChatMessage';
import { ChatComposer } from './ChatComposer';

/**
 * Inline a skill's SKILL.md straight into the wire prompt — bypassing the
 * model's autonomy over whether to call the `skill` tool.
 *
 * Why: per OpenCode's official docs, "the agent decides autonomously when
 * to load skills" and "there is no mechanism to force skill invocation."
 * In practice this means DeepSeek-class models, with mid-tier tool-calling
 * discipline, often *narrate* loading a skill ("let me load this skill...")
 * without ever emitting a real tool_call. The UX promise of "/skill" then
 * silently degrades.
 *
 * Solution: when the user types `/<skill> <body>`, look up the skill's full
 * content and emit a `<skill_content name="…">…</skill_content>` block —
 * the exact shape OpenCode's own skill tool produces. From the model's
 * vantage point this is indistinguishable from a successful tool call, so
 * the skill's instructions are *guaranteed* to land in its context.
 *
 * UI invariant: the rendered user-message bubble keeps the raw `/<skill> …`
 * form. Only the wire payload is rewritten. The user reads what they typed.
 */
function rewriteSkillPrompt(text: string, skills: Map<string, string>): string {
  const match = text.match(/^\/([A-Za-z][\w-]*)\s+([\s\S]+)$/);
  if (!match) return text;
  const [, skillName, body] = match;
  const content = skills.get(skillName);
  // Unknown skill name: keep the raw text, let the model handle it as plain prose.
  if (!content) return text;
  return [
    `<skill_content name="${skillName}">`,
    `# Skill: ${skillName}`,
    '',
    content.trim(),
    '</skill_content>',
    '',
    body,
  ].join('\n');
}

export function CodeLabChat({ moduleId: _moduleId }: { moduleId: string }) {
  const messages = useCodeLabStore((s) => s.messages);
  const isStreaming = useCodeLabStore((s) => s.isStreaming);
  const workingDirectory = useCodeLabStore((s) => s.workingDirectory);
  const sessionId = useCodeLabStore((s) => s.sessionId);
  const currentAgent = useCodeLabStore((s) => s.currentAgent);
  const agentStatus = useCodeLabStore((s) => s.agentStatus);
  const costUsd = useCodeLabStore((s) => s.costUsd);

  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** name → full SKILL.md content. Populated once at mount via /skill API. */
  const skillContentRef = useRef<Map<string, string>>(new Map());
  const [prefill, setPrefill] = useState<{ value: string; tick: number } | null>(null);

  // Auto-scroll on message change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentStatus]);

  // Cache full skill content for prompt-time injection. Fetched once because
  // it's static for the lifetime of the OpenCode container; SkillPicker still
  // uses the lighter backend endpoint (name + description only) for the list.
  useEffect(() => {
    opencode.listSkills()
      .then((list: OcSkillEntry[]) => {
        const map = new Map<string, string>();
        for (const s of list) map.set(s.name, s.content);
        skillContentRef.current = map;
      })
      .catch(() => { /* picker still works on backend list; just no inlining */ });
  }, []);

  /**
   * The one place that knows how to fully terminate an in-flight stream:
   * cancel the SSE fetch, tell OpenCode to abort the prompt server-side,
   * collapse any running tool calls to `completed`, and flip the UI to
   * idle. Idempotent — safe to call from multiple lifecycle hooks.
   *
   * `clearMessages` is only true when we want a clean slate (new session /
   * leave project / delete current session). Stop / unmount keeps the
   * messages so the user can see what already came through.
   */
  const endActiveStream = useCallback((clearMessages: boolean) => {
    abortRef.current?.abort();
    abortRef.current = null;

    const { sessionId: sid, finalizeStreamingMessage, setStreaming, setAgent, currentAgent: agent } =
      useCodeLabStore.getState();

    if (sid) opencode.abort(sid).catch(() => {});

    finalizeStreamingMessage();
    setStreaming(false);
    setAgent(agent, 'idle');

    if (clearMessages) {
      useCodeLabStore.setState({
        messages: [],
        files: [],
        sessionId: null,
      });
    }
  }, []);

  // Cleanup on unmount — user navigated away mid-stream.
  useEffect(() => () => endActiveStream(false), [endActiveStream]);

  const send = useCallback(async (text: string) => {
    const store = useCodeLabStore.getState();
    if (!text || store.isStreaming || !store.workingDirectory) return;

    const stamp = Date.now();
    store.addMessage({ id: `usr_${stamp}`, role: 'user', content: text, parts: [], timestamp: stamp });
    store.addMessage({ id: `ast_${stamp}`, role: 'assistant', content: '', parts: [], timestamp: stamp });
    store.setStreaming(true);
    store.setAgent(store.currentAgent, 'thinking');

    // Create or reuse OpenCode session
    let sid = store.sessionId;
    if (!sid) {
      try {
        const session = await codelabSessionApi.create(store.workingDirectory);
        sid = session.id;
        useCodeLabStore.getState().setSessionId(sid);
        useCodeLabStore.getState().bumpSessionList();
      } catch (e) {
        useCodeLabStore.getState().appendToLastMessage(`\n\n> **错误**: 创建会话失败：${e}`);
        useCodeLabStore.getState().setStreaming(false);
        return;
      }
    }

    abortRef.current = new AbortController();

    /**
     * SSE handlers — every reachable mutation goes through getState() so the
     * handler always sees the latest store. Reading through a closure-captured
     * `store` would freeze the snapshot at handler-creation time (see the
     * file header for context).
     */
    const handlers: OpenCodeStreamHandlers = {
      onText(delta) {
        const s = useCodeLabStore.getState();
        s.appendToLastMessage(delta);
        s.setAgent(s.currentAgent, 'writing');
      },

      onAgent(agent, action) {
        useCodeLabStore.getState().setAgent(agent, action);
      },

      onToolCall(toolCall) {
        const s = useCodeLabStore.getState();
        s.setAgent(s.currentAgent, 'tool_call');

        // Track file accesses for the sidebar's ChangesList.
        const fp = extractFilePath(toolCall.input);
        const fileStatus = toolFileStatus(toolCall.tool);
        if (fp && fileStatus) {
          s.addFile({ path: fp, status: fileStatus });
        }

        // Coalesce a `running → completed` pair into a single visible card.
        // Running shells with no useful state are skipped so the message
        // doesn't flash an empty card before the real one arrives.
        const last = s.messages[s.messages.length - 1];
        const running = last?.role === 'assistant'
          ? last.parts.find(
              (p): p is MessagePart & { kind: 'tool' } =>
                p.kind === 'tool' && p.toolCall.tool === toolCall.tool && p.toolCall.status === 'running',
            )?.toolCall
          : undefined;

        if (running) {
          s.updateToolCallInLastMessage(running.id, toolCall);
        } else {
          const hasContext = fp || toolCall.input?.command || toolCall.input?.pattern;
          const hasTitle = toolCall.title && toolCall.title !== toolCall.tool;
          if (toolCall.status === 'running' && !hasContext && !hasTitle) return;
          s.addToolCallToLastMessage(toolCall);
        }
      },

      onParallelTaskStart(taskId, agent, description) {
        const s = useCodeLabStore.getState();
        const last = s.messages[s.messages.length - 1];
        const existingGroupPart = last?.parts.find(
          (p): p is MessagePart & { kind: 'parallel-tasks' } =>
            p.kind === 'parallel-tasks' && p.group.status === 'running',
        );

        const newTask = {
          id: taskId, sessionId: taskId, agent, description,
          status: 'running' as const, startTime: Date.now(), toolCalls: [],
        };

        if (existingGroupPart) {
          // Append to the active group rather than starting a new one — keeps
          // sibling spokes inside one ForkDiagram instead of stacking diagrams.
          const updated: ParallelTaskGroup = {
            ...existingGroupPart.group,
            tasks: [...existingGroupPart.group.tasks, newTask],
          };
          useCodeLabStore.setState((state) => ({
            messages: state.messages.map((m) =>
              m.id !== last?.id ? m : {
                ...m,
                parts: m.parts.map((p) =>
                  p.kind === 'parallel-tasks' && p.group.id === existingGroupPart.group.id
                    ? { ...p, group: updated }
                    : p,
                ),
              },
            ),
          }));
        } else {
          s.addParallelTaskGroup({
            id: `ptg_${Date.now()}`,
            parentToolCallId: '',
            startTime: Date.now(),
            status: 'running',
            tasks: [newTask],
          });
        }
      },

      onParallelTaskTool(taskId, toolCall) {
        const s = useCodeLabStore.getState();

        // Subagent file accesses go to the same sidebar tracker, so a
        // ChangesList shows everything any agent touched (parent + children).
        const fp = extractFilePath(toolCall.input);
        const fileStatus = toolFileStatus(toolCall.tool);
        if (fp && fileStatus) {
          s.addFile({ path: fp, status: fileStatus });
        }

        const last = s.messages[s.messages.length - 1];
        if (!last?.parts) return;

        for (const part of last.parts) {
          if (part.kind !== 'parallel-tasks') continue;
          const task = part.group.tasks.find((t) => t.id === taskId);
          if (!task) continue;

          const running = task.toolCalls.find(
            (tc) => tc.tool === toolCall.tool && (tc.status === 'running' || tc.status === 'pending'),
          );
          if (running) {
            s.updateParallelTaskToolCall(part.group.id, taskId, running.id, toolCall);
          } else {
            s.addToolCallToParallelTask(part.group.id, taskId, toolCall);
          }
          return;
        }
      },

      onParallelTaskDone(taskId, summary, _filesRead, _filesModified, errors, timedOut) {
        const s = useCodeLabStore.getState();
        const last = s.messages[s.messages.length - 1];
        if (!last?.parts) return;

        for (const part of last.parts) {
          if (part.kind !== 'parallel-tasks') continue;
          if (!part.group.tasks.some((t) => t.id === taskId)) continue;

          const finalStatus = timedOut
            ? 'timeout'
            : errors?.length ? 'error' : 'completed';
          s.updateParallelTask(part.group.id, taskId, {
            status: finalStatus,
            endTime: Date.now(),
            summary: summary || (errors?.length ? errors.join('; ') : ''),
          });
          return;
        }
      },

      onTitleUpdate(_title) {
        // Sidebar refreshes via sessionListVersion — no extra wiring needed.
      },

      onDone(amt) {
        const s = useCodeLabStore.getState();
        s.setStreaming(false);
        s.setAgent(s.currentAgent, 'idle');
        s.finalizeStreamingMessage();
        if (amt) s.setCostUsd(s.costUsd + amt);
      },

      onError(msg) {
        const s = useCodeLabStore.getState();
        s.appendToLastMessage(`\n\n> **错误**: ${msg}`);
        s.finalizeStreamingMessage();
        s.setStreaming(false);
        s.setAgent(s.currentAgent, 'idle');
      },
    };

    // Inline SKILL.md when the user used `/<skill> <body>` — see
    // `rewriteSkillPrompt` for why we bypass the LLM's tool-calling autonomy.
    // The UI bubble above keeps the user's original input verbatim.
    const wirePrompt = rewriteSkillPrompt(text, skillContentRef.current);

    try {
      await streamPrompt(sid, wirePrompt, store.workingDirectory, handlers, abortRef.current.signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      handlers.onError(String(e));
    }
  }, []);

  const stop = useCallback(() => endActiveStream(false), [endActiveStream]);

  const handleSwitchProject = useCallback(() => {
    endActiveStream(false);
    useCodeLabStore.getState().leaveDirectory();
  }, [endActiveStream]);

  const handleNewSession = useCallback(() => {
    endActiveStream(true);
  }, [endActiveStream]);

  const handlePickPrompt = useCallback((p: string) => {
    setPrefill((prev) => ({ value: p, tick: (prev?.tick ?? 0) + 1 }));
  }, []);

  // Gate — no project? show the workshop entry hall.
  if (!workingDirectory) {
    return <ProjectStage />;
  }

  const isEmpty = messages.length === 0;
  const lastMsg = messages[messages.length - 1];

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <CodeLabContextStrip
        workingDirectory={workingDirectory}
        currentAgent={currentAgent}
        agentStatus={agentStatus}
        costUsd={costUsd}
        hasSession={!!sessionId}
        onSwitchProject={handleSwitchProject}
        onNewSession={handleNewSession}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isEmpty ? (
          <ChatEmptyState onPickPrompt={handlePickPrompt} />
        ) : (
          <div className="mx-auto max-w-[860px] px-6 py-2">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                msg={msg}
                isLast={msg === lastMsg}
                isStreaming={isStreaming}
                agentStatus={agentStatus}
                currentAgent={currentAgent}
              />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-[860px]">
        <ChatComposer
          isStreaming={isStreaming}
          agentStatus={agentStatus}
          currentAgent={currentAgent}
          costUsd={costUsd}
          prefill={prefill ?? undefined}
          onSubmit={send}
          onStop={stop}
        />
      </div>
    </div>
  );
}
