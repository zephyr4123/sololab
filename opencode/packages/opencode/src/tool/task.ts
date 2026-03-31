import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { defer } from "@/util/defer"
import { Config } from "../config/config"
import { Permission } from "@/permission"
import { Worktree } from "../worktree"
import { Instance } from "../project/instance"
import { execSync } from "child_process"
import { Log } from "@/util/log"

const log = Log.create({ service: "tool.task" })

/** Maximum summary length in characters for subtask results */
const MAX_SUMMARY_LENGTH = 3000

/** Default timeout for subtask execution (5 minutes) */
const SUBTASK_TIMEOUT_MS = 5 * 60 * 1000

export interface SubtaskResult {
  summary: string
  findings: string[]
  filesRead: string[]
  filesModified: string[]
  decisions: string[]
  errors: string[]
}

/** Extract structured result from a subtask session's messages */
export function extractSubtaskResult(resultMsg: MessageV2.WithParts, allMessages?: MessageV2.WithParts[]): SubtaskResult {
  const findings: string[] = []
  const filesRead = new Set<string>()
  const filesModified = new Set<string>()
  const decisions: string[] = []
  const errors: string[] = []

  const messagesToScan = allMessages ?? [resultMsg]

  for (const msg of messagesToScan) {
    for (const part of msg.parts) {
      if (part.type === "tool" && part.state.status === "completed") {
        const tool = part.tool
        const input = part.state.input as Record<string, any>

        // Track file operations
        if (tool === "read" || tool === "glob" || tool === "grep") {
          const filePath = input?.file_path || input?.path || input?.pattern
          if (filePath) filesRead.add(String(filePath))
        }
        if (tool === "edit" || tool === "write") {
          const filePath = input?.file_path || input?.filepath
          if (filePath) filesModified.add(String(filePath))
        }
        if (tool === "bash") {
          const cmd = input?.command
          if (cmd && typeof cmd === "string") {
            // Detect file-modifying bash commands
            if (/\b(mv|cp|rm|mkdir|touch|chmod)\b/.test(cmd)) {
              filesModified.add(`[bash] ${cmd.slice(0, 80)}`)
            }
          }
        }
      }

      // Collect errors
      if (part.type === "tool" && part.state.status === "error") {
        const errMsg = "error" in part.state ? String(part.state.error) : "Tool execution failed"
        errors.push(`[${part.tool}] ${errMsg.slice(0, 200)}`)
      }
    }
  }

  // Extract summary from last text part
  const lastText = resultMsg.parts.findLast((p) => p.type === "text")?.text ?? ""

  // Extract findings: lines that start with discovery markers
  const findingPatterns = /(?:^|\n)\s*[-*]\s*(found|discovered|noticed|learned|important|note|key finding|observation)[:\s](.+)/gi
  let match: RegExpExecArray | null
  while ((match = findingPatterns.exec(lastText)) !== null) {
    findings.push(match[2].trim())
  }

  // Extract decisions: lines with decision markers
  const decisionPatterns = /(?:^|\n)\s*[-*]\s*(decided|chose|selected|will use|using|approach|solution|recommendation)[:\s](.+)/gi
  while ((match = decisionPatterns.exec(lastText)) !== null) {
    decisions.push(match[2].trim())
  }

  // Truncate at a natural boundary (sentence/paragraph) rather than mid-word
  let summary = lastText
  if (summary.length > MAX_SUMMARY_LENGTH) {
    summary = summary.slice(0, MAX_SUMMARY_LENGTH)
    // Try to break at last sentence-ending punctuation (。.!?！？\n)
    const lastBreak = Math.max(
      summary.lastIndexOf("\n"),
      summary.lastIndexOf("。"),
      summary.lastIndexOf(". "),
      summary.lastIndexOf("！"),
      summary.lastIndexOf("？"),
    )
    if (lastBreak > MAX_SUMMARY_LENGTH * 0.5) {
      summary = summary.slice(0, lastBreak + 1)
    }
    summary += "\n\n...(truncated)"
  }

  return {
    summary,
    findings,
    filesRead: [...filesRead],
    filesModified: [...filesModified],
    decisions,
    errors,
  }
}

/** Format SubtaskResult as structured XML for parent agent */
export function formatSubtaskResult(result: SubtaskResult, sessionId: string): string {
  const parts: string[] = [
    `task_id: ${sessionId} (for resuming to continue this task if needed)`,
    "",
    "<task_result>",
    `<summary>${result.summary}</summary>`,
  ]

  if (result.findings.length > 0) {
    parts.push("<findings>")
    for (const f of result.findings) parts.push(`  <finding>${f}</finding>`)
    parts.push("</findings>")
  }

  if (result.filesRead.length > 0) {
    parts.push(`<files_read>${result.filesRead.join(", ")}</files_read>`)
  }

  if (result.filesModified.length > 0) {
    parts.push(`<files_modified>${result.filesModified.join(", ")}</files_modified>`)
  }

  if (result.decisions.length > 0) {
    parts.push("<decisions>")
    for (const d of result.decisions) parts.push(`  <decision>${d}</decision>`)
    parts.push("</decisions>")
  }

  if (result.errors.length > 0) {
    parts.push("<errors>")
    for (const e of result.errors) parts.push(`  <error>${e}</error>`)
    parts.push("</errors>")
  }

  parts.push("</task_result>")
  return parts.join("\n")
}

const parameters = z.object({
  description: z.string().describe("A short (3-5 words) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().describe("The type of specialized agent to use for this task"),
  task_id: z
    .string()
    .describe(
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
    )
    .optional(),
  command: z.string().describe("The command that triggered this task").optional(),
  isolation: z
    .enum(["none", "worktree"])
    .describe(
      "Isolation mode. Default 'worktree' creates a temporary git worktree so the agent works on an isolated copy of the repo. Changes are auto-merged back to the main directory after completion. Use 'none' only for tasks that you are certain will not write any files.",
    )
    .default("worktree")
    .optional(),
})

export const TaskTool = Tool.define("task", async (ctx) => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))

  // Filter agents by permissions if agent provided
  const caller = ctx?.agent
  const accessibleAgents = caller
    ? agents.filter((a) => Permission.evaluate("task", a.name, caller.permission).action !== "deny")
    : agents
  const list = accessibleAgents.toSorted((a, b) => a.name.localeCompare(b.name))

  const description = DESCRIPTION.replace(
    "{agents}",
    list
      .map((a) => `- ${a.name}: ${a.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )
  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const config = await Config.get()

      // Skip permission check when user explicitly invoked via @ or command subtask
      if (!ctx.extra?.bypassAgentCheck) {
        await ctx.ask({
          permission: "task",
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const agent = await Agent.get(params.subagent_type)
      if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`)

      const hasTaskPermission = agent.permission.some((rule) => rule.permission === "task")
      const hasTodoWritePermission = agent.permission.some((rule) => rule.permission === "todowrite")

      const session = await iife(async () => {
        if (params.task_id) {
          const found = await Session.get(SessionID.make(params.task_id)).catch(() => {})
          if (found) return found
        }

        return await Session.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${agent.name} subagent)`,
          permission: [
            ...(hasTodoWritePermission
              ? []
              : [
                  {
                    permission: "todowrite" as const,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...(hasTaskPermission
              ? []
              : [
                  {
                    permission: "task" as const,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...(config.experimental?.primary_tools?.map((t) => ({
              pattern: "*",
              action: "allow" as const,
              permission: t,
            })) ?? []),
          ],
        })
      })
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") throw new Error("Not an assistant message")

      const model = agent.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: session.id,
          model,
        },
      })

      const messageID = MessageID.ascending()

      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))
      const promptParts = await SessionPrompt.resolvePromptParts(params.prompt)

      const promptArgs = {
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: agent.name,
        tools: {
          ...(hasTodoWritePermission ? {} : { todowrite: false }),
          ...(hasTaskPermission ? {} : { task: false }),
          ...Object.fromEntries((config.experimental?.primary_tools ?? []).map((t) => [t, false])),
        },
        parts: promptParts,
      }

      // Worktree isolation: create temporary git worktree for isolated execution
      const mainDirectory = Instance.directory // capture before entering worktree context
      let result: MessageV2.WithParts | undefined
      let worktreeDiff = ""
      let worktreeMergeStatus: "applied" | "conflict" | "skipped" = "skipped"
      let worktreeInfo: Worktree.Info | undefined
      let timedOut = false

      if (params.isolation === "worktree") {
        try {
          worktreeInfo = await Worktree.create({ name: `task-${Date.now().toString(36)}` })
        } catch (e) {
          // Worktree creation may fail (not a git repo, etc.) — fall back to normal execution
          worktreeInfo = undefined
        }
      }

      // Wrap session prompt with timeout to prevent infinite hangs
      async function promptWithTimeout(fn: () => Promise<MessageV2.WithParts>): Promise<MessageV2.WithParts> {
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            timedOut = true
            log.warn("subtask timeout", {
              sessionID: session.id,
              agent: agent.name,
              description: params.description,
              timeoutMs: SUBTASK_TIMEOUT_MS,
            })
            cancel() // Cancel the child session
            reject(new Error(`Subtask timed out after ${SUBTASK_TIMEOUT_MS / 60000} minutes`))
          }, SUBTASK_TIMEOUT_MS)
        })
        // Clear timeout if parent aborts first
        const clearOnAbort = () => { if (timeoutHandle) clearTimeout(timeoutHandle) }
        ctx.abort.addEventListener("abort", clearOnAbort)
        try {
          return await Promise.race([fn(), timeoutPromise])
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle)
          ctx.abort.removeEventListener("abort", clearOnAbort)
        }
      }

      try {
        if (worktreeInfo) {
          try {
            // Execute subtask within the isolated worktree context
            result = (await promptWithTimeout(() =>
              Instance.provide({
                directory: worktreeInfo!.directory,
                fn: () => SessionPrompt.prompt(promptArgs),
              }) as Promise<unknown> as Promise<MessageV2.WithParts>
            ))
            // Capture diff before cleanup
            try {
              worktreeDiff = execSync("git diff HEAD", {
                cwd: worktreeInfo.directory,
                encoding: "utf-8",
                maxBuffer: 2 * 1024 * 1024,
              })
            } catch {}
            // Auto-merge: apply worktree changes back to the main working directory
            if (worktreeDiff) {
              try {
                execSync("git apply --3way -", {
                  cwd: mainDirectory,
                  input: worktreeDiff,
                  encoding: "utf-8",
                  maxBuffer: 2 * 1024 * 1024,
                })
                worktreeMergeStatus = "applied"
                log.info("worktree diff applied", { sessionID: session.id, agent: agent.name })
              } catch (applyErr: any) {
                worktreeMergeStatus = "conflict"
                log.warn("worktree diff apply failed, changes returned as diff text", {
                  sessionID: session.id,
                  agent: agent.name,
                  error: String(applyErr),
                })
              }
            }
          } finally {
            await Worktree.remove({ directory: worktreeInfo.directory }).catch(() => {})
          }
        } else {
          result = await promptWithTimeout(() => SessionPrompt.prompt(promptArgs))
        }
      } catch (e: any) {
        if (!timedOut) throw e
        // On timeout, construct a minimal result from the last message in the child session
        log.warn("subtask timed out, extracting partial results", { sessionID: session.id })
      }

      // Extract structured result from subtask (also works for timeout — extracts partial results)
      let allMessages: MessageV2.WithParts[] | undefined
      try {
        allMessages = await Session.messages({ sessionID: session.id }) ?? undefined
        // If timed out and no result, use the last assistant message as fallback
        if (!result && allMessages?.length) {
          result = allMessages[allMessages.length - 1]
        }
      } catch {
        // Fallback: use only the result message
      }
      // If still no result, create an empty one
      if (!result) {
        result = { info: { role: "assistant" } as any, parts: [] }
      }

      const structured = extractSubtaskResult(result!, allMessages)
      if (timedOut) {
        structured.errors.push(`Subtask timed out after ${SUBTASK_TIMEOUT_MS / 60000} minutes — partial results returned`)
      }
      let output = formatSubtaskResult(structured, session.id)

      // Append worktree merge status and diff if isolation was used
      if (worktreeDiff) {
        if (worktreeMergeStatus === "applied") {
          output += "\n\n<worktree_merge status=\"applied\">Changes have been auto-merged into the main working directory.</worktree_merge>"
        } else if (worktreeMergeStatus === "conflict") {
          output += "\n\n<worktree_merge status=\"conflict\">Auto-merge failed. The diff is included below for manual application.</worktree_merge>"
          output += "\n<worktree_diff>\n" + worktreeDiff.slice(0, 50000) + "\n</worktree_diff>"
        }
      }

      return {
        title: params.description,
        metadata: {
          sessionId: session.id,
          model,
          structured,
          isolation: worktreeInfo ? "worktree" : "none",
          worktreeMergeStatus,
          timedOut,
          // Skip global truncation — task output is already a structured summary (max 3000 char summary)
          truncated: false,
        },
        output,
      }
    },
  }
})
