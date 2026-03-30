import { describe, test, expect } from "bun:test"
import { CompactionLevels } from "../../src/session/compaction-levels"

describe("CompactionLevels.compressOutput", () => {
  test("does not compress short outputs", () => {
    const output = "Hello world"
    const result = CompactionLevels.compressOutput(output, "read")
    expect(result.compressed).toBe(output)
    expect(result.saved).toBe(0)
  })

  test("compresses long read output (keeps head + tail)", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}: ${"x".repeat(50)}`)
    const output = lines.join("\n")
    const result = CompactionLevels.compressOutput(output, "read")
    expect(result.saved).toBeGreaterThan(0)
    expect(result.compressed).toContain("Line 0")
    expect(result.compressed).toContain("lines omitted")
    expect(result.compressed).toContain("Line 99")
  })

  test("compresses grep output (keeps first 3 matches per file)", () => {
    // Build a large enough grep output to exceed the compression threshold
    const lines = [
      "Found 30 matches",
      "src/auth/authentication-service.ts:",
    ]
    for (let i = 0; i < 10; i++) {
      lines.push(`  Line ${i * 10 + 1}: export function authenticationHandler${i}(request: Request, response: Response) { return validate(token${i}) }`)
    }
    lines.push("")
    lines.push("src/config/database-configuration.ts:")
    lines.push("  Line 1: const configMatch1 = loadDatabaseConfig()")
    lines.push("  Line 2: const configMatch2 = validateConfig()")

    const output = lines.join("\n")
    const result = CompactionLevels.compressOutput(output, "grep")
    expect(result.compressed).toContain("authenticationHandler0")
    expect(result.compressed).toContain("authenticationHandler1")
    expect(result.compressed).toContain("authenticationHandler2")
    expect(result.compressed).toContain("and 7 more matches")
    expect(result.compressed).toContain("configMatch1")
  })

  test("compresses glob output (keeps first 20 files)", () => {
    const files = Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`)
    const output = files.join("\n")
    const result = CompactionLevels.compressOutput(output, "glob")
    expect(result.saved).toBeGreaterThan(0)
    expect(result.compressed).toContain("src/file0.ts")
    expect(result.compressed).toContain("and 30 more files")
  })

  test("compresses bash output (keeps head + tail)", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `output line ${i}`)
    const output = lines.join("\n")
    const result = CompactionLevels.compressOutput(output, "bash")
    expect(result.saved).toBeGreaterThan(0)
    expect(result.compressed).toContain("output line 0")
    expect(result.compressed).toContain("lines omitted")
    expect(result.compressed).toContain("output line 99")
  })

  test("generic compression for unknown tools", () => {
    const output = "x".repeat(5000)
    const result = CompactionLevels.compressOutput(output, "unknown_tool")
    expect(result.saved).toBeGreaterThan(0)
    expect(result.compressed).toContain("content compressed")
    expect(result.compressed.length).toBeLessThan(output.length)
  })

  test("does not compress short read (< 30 lines)", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}: content`)
    const output = lines.join("\n")
    const result = CompactionLevels.compressOutput(output, "read")
    expect(result.compressed).toBe(output)
  })
})

describe("CompactionLevels.decideTrigger", () => {
  test("no action below 70% usage", () => {
    const result = CompactionLevels.decideTrigger(60_000, 128_000, 8_000)
    // usage = 60000 / (128000-8000) = 0.5
    expect(result.action).toBe("none")
  })

  test("L1+L2 between 70-85% usage", () => {
    const result = CompactionLevels.decideTrigger(90_000, 128_000, 8_000)
    // usage = 90000 / 120000 = 0.75
    expect(result.action).toBe("l1+l2")
    expect(result.usage).toBeGreaterThan(0.7)
    expect(result.usage).toBeLessThan(0.85)
  })

  test("L3 at 85%+ usage", () => {
    const result = CompactionLevels.decideTrigger(110_000, 128_000, 8_000)
    // usage = 110000 / 120000 = 0.917
    expect(result.action).toBe("l3")
    expect(result.usage).toBeGreaterThan(0.85)
  })

  test("handles zero context limit", () => {
    const result = CompactionLevels.decideTrigger(100, 0, 0)
    expect(result.action).toBe("none")
  })

  test("handles edge case at exactly 70%", () => {
    const usable = 100_000
    const result = CompactionLevels.decideTrigger(70_000, usable + 10_000, 10_000)
    // usage = 70000 / 100000 = 0.7
    expect(result.action).toBe("l1+l2")
  })

  test("handles edge case at exactly 85%", () => {
    const usable = 100_000
    const result = CompactionLevels.decideTrigger(85_000, usable + 10_000, 10_000)
    // usage = 85000 / 100000 = 0.85
    expect(result.action).toBe("l3")
  })
})

describe("CompactionLevels.decideRecovery", () => {
  test("first failure: retry", () => {
    const result = CompactionLevels.decideRecovery(0, true)
    expect(result.action).toBe("retry")
  })

  test("second failure with L2 available: fallback to L2", () => {
    const result = CompactionLevels.decideRecovery(1, true)
    expect(result.action).toBe("l2_fallback")
  })

  test("second failure without L2: new session", () => {
    const result = CompactionLevels.decideRecovery(1, false)
    expect(result.action).toBe("new_session")
  })

  test("third failure: always new session", () => {
    const result = CompactionLevels.decideRecovery(2, true)
    expect(result.action).toBe("new_session")
  })
})

describe("CompactionLevels.applyL2", () => {
  test("compresses old tool outputs beyond protection threshold", () => {
    const msgs: any[] = [
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "first" }],
      },
      {
        info: { role: "assistant" },
        parts: [
          {
            type: "tool",
            tool: "read",
            state: {
              status: "completed",
              output: Array.from({ length: 100 }, (_, i) => `Line ${i}: ${"x".repeat(80)}`).join("\n"),
              time: {},
            },
          },
        ],
      },
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "second" }],
      },
      {
        info: { role: "assistant" },
        parts: [
          {
            type: "tool",
            tool: "read",
            state: { status: "completed", output: "recent output", time: {} },
          },
        ],
      },
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "third" }],
      },
    ]

    const { totalSaved } = CompactionLevels.applyL2(msgs, 100) // Low protect threshold
    expect(totalSaved).toBeGreaterThan(0)
  })

  test("protects recent tool outputs", () => {
    const msgs: any[] = [
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "first" }],
      },
      {
        info: { role: "assistant" },
        parts: [
          {
            type: "tool",
            tool: "read",
            state: { status: "completed", output: "short", time: {} },
          },
        ],
      },
    ]

    const { totalSaved } = CompactionLevels.applyL2(msgs, 40_000)
    expect(totalSaved).toBe(0) // Nothing compressed: within protection window
  })
})
