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

  return {
    summary: lastText.slice(0, 500),
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
      "Isolation mode. 'worktree' creates a temporary git worktree so the agent works on an isolated copy of the repo. Changes are captured as a diff and the worktree is cleaned up automatically.",
    )
    .default("none")
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
      let result: MessageV2.WithParts
      let worktreeDiff = ""
      let worktreeInfo: Worktree.Info | undefined

      if (params.isolation === "worktree") {
        try {
          worktreeInfo = await Worktree.create({ name: `task-${Date.now().toString(36)}` })
        } catch (e) {
          // Worktree creation may fail (not a git repo, etc.) — fall back to normal execution
          worktreeInfo = undefined
        }
      }

      if (worktreeInfo) {
        try {
          // Execute subtask within the isolated worktree context
          result = (await Instance.provide({
            directory: worktreeInfo.directory,
            fn: () => SessionPrompt.prompt(promptArgs),
          })) as unknown as MessageV2.WithParts
          // Capture diff before cleanup
          try {
            worktreeDiff = execSync("git diff HEAD", {
              cwd: worktreeInfo.directory,
              encoding: "utf-8",
              maxBuffer: 2 * 1024 * 1024,
            })
          } catch {}
        } finally {
          await Worktree.remove({ directory: worktreeInfo.directory }).catch(() => {})
        }
      } else {
        result = await SessionPrompt.prompt(promptArgs)
      }

      // Extract structured result from subtask
      let allMessages: MessageV2.WithParts[] | undefined
      try {
        allMessages = await Session.messages({ sessionID: session.id }) ?? undefined
      } catch {
        // Fallback: use only the result message
      }

      const structured = extractSubtaskResult(result, allMessages)
      let output = formatSubtaskResult(structured, session.id)

      // Append worktree diff if isolation was used
      if (worktreeDiff) {
        output += "\n\n<worktree_diff>\n" + worktreeDiff.slice(0, 50000) + "\n</worktree_diff>"
      }

      return {
        title: params.description,
        metadata: {
          sessionId: session.id,
          model,
          structured,
          isolation: worktreeInfo ? "worktree" : "none",
          worktreeBranch: worktreeInfo?.branch,
          // Skip global truncation — task output is already a structured summary
          // (formatSubtaskResult caps summary at 500 chars, worktree diff at 50KB)
          truncated: false,
        },
        output,
      }
    },
  }
})
