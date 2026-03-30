import { Token } from "../util/token"
import { Log } from "../util/log"
import type { MessageV2 } from "./message-v2"

export namespace CompactionLevels {
  const log = Log.create({ service: "session.compaction-levels" })

  /** Compaction level definitions:
   * L1: Prune old tool outputs (existing behavior, no LLM)
   * L2: Compress tool outputs to summaries (no LLM, heuristic)
   * L3: Full LLM-based compaction (existing behavior)
   */
  export type Level = 1 | 2 | 3

  // --- Level 2: Output Compression ---

  /** Compress a tool output to a summary (no LLM needed).
   * Returns the compressed output and the token savings.
   */
  export function compressOutput(output: string, tool: string): { compressed: string; saved: number } {
    const originalTokens = Token.estimate(output)

    // Skip short outputs (but still allow specific tool-aware compression for medium outputs)
    if (originalTokens < 50) {
      return { compressed: output, saved: 0 }
    }

    let compressed: string

    switch (tool) {
      case "read": {
        // For file reads, keep first 10 + last 5 lines, summarize middle
        const lines = output.split("\n")
        if (lines.length > 30) {
          const head = lines.slice(0, 10).join("\n")
          const tail = lines.slice(-5).join("\n")
          compressed = `${head}\n... [${lines.length - 15} lines omitted] ...\n${tail}`
        } else {
          compressed = output
        }
        break
      }

      case "grep": {
        // For grep results, keep file paths and match counts, trim individual matches
        const lines = output.split("\n")
        const summaryLines: string[] = []
        let currentFile = ""
        let matchCount = 0

        for (const line of lines) {
          // Detect file path headers (contains "/" or "\" and ends with ":")
          if (line.endsWith(":") && (line.includes("/") || line.includes("\\"))) {
            if (currentFile && matchCount > 3) {
              summaryLines.push(`  ... and ${matchCount - 3} more matches`)
            }
            currentFile = line
            matchCount = 0
            summaryLines.push(line)
          } else if (line.startsWith("  Line ")) {
            matchCount++
            if (matchCount <= 3) summaryLines.push(line)
          } else {
            summaryLines.push(line)
          }
        }
        if (currentFile && matchCount > 3) {
          summaryLines.push(`  ... and ${matchCount - 3} more matches`)
        }
        compressed = summaryLines.join("\n")
        break
      }

      case "glob": {
        // For glob results, keep first 20 files, summarize rest
        const lines = output.split("\n")
        if (lines.length > 25) {
          compressed = lines.slice(0, 20).join("\n") + `\n... and ${lines.length - 20} more files`
        } else {
          compressed = output
        }
        break
      }

      case "bash": {
        // For bash output, keep first 20 + last 10 lines
        const lines = output.split("\n")
        if (lines.length > 40) {
          const head = lines.slice(0, 20).join("\n")
          const tail = lines.slice(-10).join("\n")
          compressed = `${head}\n... [${lines.length - 30} lines omitted] ...\n${tail}`
        } else {
          compressed = output
        }
        break
      }

      default: {
        // Generic: truncate to ~50% of original, keeping start and end
        const half = Math.floor(output.length / 2)
        if (output.length > 2000) {
          const keepStart = Math.floor(half * 0.6)
          const keepEnd = Math.floor(half * 0.4)
          compressed =
            output.slice(0, keepStart) +
            "\n... [content compressed] ...\n" +
            output.slice(-keepEnd)
        } else {
          compressed = output
        }
        break
      }
    }

    const compressedTokens = Token.estimate(compressed)
    const saved = Math.max(0, originalTokens - compressedTokens)

    return { compressed, saved }
  }

  /** Apply Level 2 compression to messages: compress old tool outputs to summaries */
  export function applyL2(
    msgs: MessageV2.WithParts[],
    protectTokens: number,
  ): { messages: MessageV2.WithParts[]; totalSaved: number } {
    let totalTokens = 0
    let totalSaved = 0
    let turns = 0

    // Scan backwards, protect recent turns
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]
      if (msg.info.role === "user") turns++
      if (turns < 2) continue
      if (msg.info.role === "assistant" && (msg.info as any).summary) break

      for (const part of msg.parts) {
        if (part.type !== "tool") continue
        if (part.state.status !== "completed") continue
        if ((part.state as any).time?.compacted) continue

        const output = part.state.output
        const estimate = Token.estimate(output)
        totalTokens += estimate

        if (totalTokens > protectTokens) {
          const { compressed, saved } = compressOutput(output, part.tool)
          if (saved > 0) {
            ;(part.state as any).output = compressed
            ;(part.state as any).l2Compressed = true
            totalSaved += saved
          }
        }
      }
    }

    log.info("L2 compression", { totalSaved })
    return { messages: msgs, totalSaved }
  }

  // --- Pre-emptive Trigger Logic ---

  export interface TriggerDecision {
    action: "none" | "l1" | "l2" | "l1+l2" | "l3"
    usage: number
    threshold: number
  }

  /**
   * Determine which compaction level to trigger based on context usage.
   * @param usedTokens Current token count
   * @param contextLimit Model context limit
   * @param reserved Reserved tokens for output
   * @returns The compaction action to take
   */
  export function decideTrigger(
    usedTokens: number,
    contextLimit: number,
    reserved: number,
  ): TriggerDecision {
    const usable = contextLimit - reserved
    if (usable <= 0) return { action: "none", usage: 0, threshold: 0 }

    const usage = usedTokens / usable

    // < 70%: no action
    if (usage < 0.7) {
      return { action: "none", usage, threshold: 0.7 }
    }

    // 70-85%: apply L1 (prune) + L2 (compress) — no LLM needed
    if (usage < 0.85) {
      return { action: "l1+l2", usage, threshold: 0.85 }
    }

    // >= 85%: full L3 compaction (LLM-based)
    return { action: "l3", usage, threshold: 1.0 }
  }

  // --- Failure Recovery ---

  export interface RecoveryAction {
    action: "retry" | "l2_fallback" | "new_session"
    reason: string
  }

  /**
   * Determine recovery action when compaction fails.
   * @param attempt Number of failed attempts so far
   * @param l2Available Whether L2 compression hasn't been tried yet
   */
  export function decideRecovery(attempt: number, l2Available: boolean): RecoveryAction {
    if (attempt === 0) {
      return { action: "retry", reason: "First failure, retrying compaction" }
    }

    if (attempt === 1 && l2Available) {
      return { action: "l2_fallback", reason: "Retry failed, falling back to L2 compression only" }
    }

    return { action: "new_session", reason: "All compaction attempts failed, recommend starting new session" }
  }
}
