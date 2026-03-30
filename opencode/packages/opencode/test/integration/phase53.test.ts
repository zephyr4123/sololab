import { describe, test, expect } from "bun:test"
import { CompactionLevels } from "../../src/session/compaction-levels"

describe("Phase 5.3 Integration: Compaction levels", () => {
  test("pre-emptive trigger progression: none → L1+L2 → L3", () => {
    // 50% usage → none
    const t1 = CompactionLevels.decideTrigger(50_000, 128_000, 8_000)
    expect(t1.action).toBe("none")

    // 75% usage → L1+L2
    const t2 = CompactionLevels.decideTrigger(90_000, 128_000, 8_000)
    expect(t2.action).toBe("l1+l2")

    // 90% usage → L3
    const t3 = CompactionLevels.decideTrigger(108_000, 128_000, 8_000)
    expect(t3.action).toBe("l3")
  })

  test("failure recovery escalation", () => {
    expect(CompactionLevels.decideRecovery(0, true).action).toBe("retry")
    expect(CompactionLevels.decideRecovery(1, true).action).toBe("l2_fallback")
    expect(CompactionLevels.decideRecovery(2, true).action).toBe("new_session")
  })

  test("L2 compression achieves 40%+ reduction on large outputs", () => {
    const largeOutput = Array.from({ length: 200 }, (_, i) => `Line ${i}: ${"x".repeat(100)}`).join("\n")
    const { compressed, saved } = CompactionLevels.compressOutput(largeOutput, "read")

    const originalTokens = Math.ceil(largeOutput.length / 4)
    const reductionPct = saved / originalTokens
    expect(reductionPct).toBeGreaterThan(0.4)
    expect(compressed).toContain("Line 0")
    expect(compressed).toContain("lines omitted")
  })

  test("L2 compression preserves critical grep info", () => {
    const grepOutput = [
      "Found 10 matches",
      "src/auth.ts:",
      "  Line 1: export function login()",
      "  Line 5: export function logout()",
      "  Line 10: export function verify()",
      "  Line 15: function internal1()",
      "  Line 20: function internal2()",
    ].join("\n")

    const { compressed } = CompactionLevels.compressOutput(grepOutput, "grep")
    expect(compressed).toContain("login")
    expect(compressed).toContain("logout")
    expect(compressed).toContain("verify")
  })
})
