import { describe, test, expect } from "bun:test"
import { extractSubtaskResult, formatSubtaskResult, type SubtaskResult } from "../../src/tool/task"
import type { MessageV2 } from "../../src/session/message-v2"

// Helper to create a mock WithParts message
function mockMessage(parts: any[], role: string = "assistant"): MessageV2.WithParts {
  return {
    info: {
      id: "msg_test" as any,
      sessionID: "ses_test" as any,
      role: role as any,
    } as any,
    parts: parts.map((p, i) => ({
      id: `prt_${i}` as any,
      sessionID: "ses_test" as any,
      messageID: "msg_test" as any,
      ...p,
    })),
  }
}

describe("extractSubtaskResult", () => {
  test("extracts summary from last text part", () => {
    const msg = mockMessage([
      { type: "text", text: "I analyzed the codebase and found the issue." },
      { type: "text", text: "The final conclusion is that auth needs refactoring." },
    ])

    const result = extractSubtaskResult(msg)
    expect(result.summary).toContain("final conclusion")
  })

  test("tracks files read from tool calls", () => {
    const msgs = [
      mockMessage([
        {
          type: "tool",
          tool: "read",
          state: {
            status: "completed",
            input: { file_path: "/src/auth.ts" },
            output: "file content",
            title: "Read file",
            metadata: {},
            time: { start: 1, end: 2 },
          },
        },
        {
          type: "tool",
          tool: "grep",
          state: {
            status: "completed",
            input: { pattern: "login", path: "/src/" },
            output: "matches",
            title: "Grep",
            metadata: {},
            time: { start: 3, end: 4 },
          },
        },
      ]),
      mockMessage([{ type: "text", text: "Summary" }]),
    ]

    const result = extractSubtaskResult(msgs[1], msgs)
    expect(result.filesRead).toContain("/src/auth.ts")
  })

  test("tracks files modified from edit/write tools", () => {
    const msgs = [
      mockMessage([
        {
          type: "tool",
          tool: "edit",
          state: {
            status: "completed",
            input: { file_path: "/src/config.ts" },
            output: "edited",
            title: "Edit",
            metadata: {},
            time: { start: 1, end: 2 },
          },
        },
        {
          type: "tool",
          tool: "write",
          state: {
            status: "completed",
            input: { filepath: "/src/new-file.ts" },
            output: "written",
            title: "Write",
            metadata: {},
            time: { start: 3, end: 4 },
          },
        },
      ]),
      mockMessage([{ type: "text", text: "Done editing files." }]),
    ]

    const result = extractSubtaskResult(msgs[1], msgs)
    expect(result.filesModified).toContain("/src/config.ts")
    expect(result.filesModified).toContain("/src/new-file.ts")
  })

  test("collects errors from failed tool calls", () => {
    const msg = mockMessage([
      {
        type: "tool",
        tool: "bash",
        state: {
          status: "error",
          error: "Command failed: npm run build",
          input: { command: "npm run build" },
          time: { start: 1, end: 2 },
        },
      },
      { type: "text", text: "The build failed due to missing dependencies." },
    ])

    const result = extractSubtaskResult(msg)
    expect(result.errors.length).toBeGreaterThanOrEqual(1)
    expect(result.errors[0]).toContain("bash")
    expect(result.errors[0]).toContain("Command failed")
  })

  test("detects file-modifying bash commands", () => {
    const msg = mockMessage([
      {
        type: "tool",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "mkdir -p /src/components" },
          output: "",
          title: "Bash",
          metadata: {},
          time: { start: 1, end: 2 },
        },
      },
      { type: "text", text: "Created directory." },
    ])

    const result = extractSubtaskResult(msg)
    expect(result.filesModified.length).toBe(1)
    expect(result.filesModified[0]).toContain("mkdir")
  })

  test("handles empty message with no parts", () => {
    const msg = mockMessage([])
    const result = extractSubtaskResult(msg)
    expect(result.summary).toBe("")
    expect(result.findings).toEqual([])
    expect(result.filesRead).toEqual([])
    expect(result.filesModified).toEqual([])
    expect(result.errors).toEqual([])
  })

  test("deduplicates file paths", () => {
    const msgs = [
      mockMessage([
        {
          type: "tool",
          tool: "edit",
          state: {
            status: "completed",
            input: { file_path: "/src/index.ts" },
            output: "edit1",
            title: "Edit",
            metadata: {},
            time: { start: 1, end: 2 },
          },
        },
        {
          type: "tool",
          tool: "edit",
          state: {
            status: "completed",
            input: { file_path: "/src/index.ts" },
            output: "edit2",
            title: "Edit",
            metadata: {},
            time: { start: 3, end: 4 },
          },
        },
      ]),
      mockMessage([{ type: "text", text: "Done." }]),
    ]

    const result = extractSubtaskResult(msgs[1], msgs)
    expect(result.filesModified.filter((f) => f === "/src/index.ts").length).toBe(1)
  })

  test("truncates long summary at natural boundary", () => {
    // Create a text longer than 3000 chars with sentence boundaries
    const sentences = Array.from({ length: 100 }, (_, i) => `This is sentence number ${i + 1} of the analysis report。`).join("\n")
    expect(sentences.length).toBeGreaterThan(3000)

    const msg = mockMessage([{ type: "text", text: sentences }])
    const result = extractSubtaskResult(msg)

    // Should be truncated
    expect(result.summary.length).toBeLessThan(sentences.length)
    expect(result.summary).toContain("...(truncated)")
    // Should break at a sentence boundary (。) or newline
    const beforeMarker = result.summary.split("\n\n...(truncated)")[0]
    expect(beforeMarker.endsWith("。") || beforeMarker.endsWith("\n")).toBe(true)
  })

  test("does not truncate summary under 3000 chars", () => {
    const text = "A short analysis result that fits well within the limit."
    const msg = mockMessage([{ type: "text", text }])
    const result = extractSubtaskResult(msg)

    expect(result.summary).toBe(text)
    expect(result.summary).not.toContain("...(truncated)")
  })

  test("truncates Chinese text at sentence boundary", () => {
    // Chinese text with 。as sentence delimiter
    const text = Array.from({ length: 200 }, (_, i) => `这是第${i + 1}个分析结论，包含一些重要的发现。`).join("")
    expect(text.length).toBeGreaterThan(3000)

    const msg = mockMessage([{ type: "text", text }])
    const result = extractSubtaskResult(msg)

    expect(result.summary).toContain("...(truncated)")
    const beforeMarker = result.summary.split("\n\n...(truncated)")[0]
    expect(beforeMarker.endsWith("。")).toBe(true)
  })
})

describe("formatSubtaskResult", () => {
  test("formats basic result as XML", () => {
    const result: SubtaskResult = {
      summary: "Implemented the auth module",
      findings: ["JWT tokens expire after 24h", "Redis is required for sessions"],
      filesRead: ["/src/auth.ts"],
      filesModified: ["/src/auth.ts", "/src/config.ts"],
      decisions: ["Using bcrypt for password hashing"],
      errors: [],
    }

    const output = formatSubtaskResult(result, "ses_test123")
    expect(output).toContain("task_id: ses_test123")
    expect(output).toContain("<task_result>")
    expect(output).toContain("</task_result>")
    expect(output).toContain("<summary>")
    expect(output).toContain("<findings>")
    expect(output).toContain("<finding>JWT tokens expire after 24h</finding>")
    expect(output).toContain("<files_modified>/src/auth.ts, /src/config.ts</files_modified>")
    expect(output).toContain("<decisions>")
    expect(output).not.toContain("<errors>") // no errors
  })

  test("omits empty sections", () => {
    const result: SubtaskResult = {
      summary: "Done",
      findings: [],
      filesRead: [],
      filesModified: [],
      decisions: [],
      errors: [],
    }

    const output = formatSubtaskResult(result, "ses_test")
    expect(output).toContain("<summary>Done</summary>")
    expect(output).not.toContain("<findings>")
    expect(output).not.toContain("<files_read>")
    expect(output).not.toContain("<files_modified>")
    expect(output).not.toContain("<decisions>")
    expect(output).not.toContain("<errors>")
  })

  test("includes errors section when present", () => {
    const result: SubtaskResult = {
      summary: "Build failed",
      findings: [],
      filesRead: [],
      filesModified: [],
      decisions: [],
      errors: ["[bash] npm run build failed with exit code 1"],
    }

    const output = formatSubtaskResult(result, "ses_test")
    expect(output).toContain("<errors>")
    expect(output).toContain("<error>[bash] npm run build failed with exit code 1</error>")
  })
})
