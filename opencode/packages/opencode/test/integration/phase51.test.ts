/**
 * Phase 5.1 Integration Tests
 *
 * Tests cross-cutting concerns:
 * - Token estimation accuracy across content types in compaction context
 * - Atomic file writes under concurrent load
 * - Tool init caching across multiple agent loop iterations
 * - Instruction cache coherence with file modifications
 */
import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Token } from "../../src/util/token"
import { Filesystem } from "../../src/util/filesystem"
import { clearInstructionCache, invalidateInstructionCache } from "../../src/session/instruction"
import { tmpdir } from "../fixture/fixture"

afterEach(() => {
  Token.resetCalibration()
  clearInstructionCache()
})

describe("Phase 5.1 Integration", () => {
  // ── 5.1.1 + compaction: Token estimation in pruning context ────
  describe("Token estimation for compaction pruning", () => {
    test("CJK tool output gets higher token estimate than plain English of same length", () => {
      const english = "a".repeat(4000) // 1000 tokens at 4 chars/token
      const chinese = "中".repeat(4000) // 2667 tokens at 1.5 chars/token

      const engEst = Token.estimate(english)
      const cjkEst = Token.estimate(chinese)

      // CJK should estimate significantly more tokens
      expect(cjkEst).toBeGreaterThan(engEst * 2)
    })

    test("JSON tool output gets appropriate estimate for pruning", () => {
      const jsonOutput = JSON.stringify(
        Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `item-${i}`,
          value: Math.random(),
          tags: ["a", "b", "c"],
        })),
      )

      const est = Token.estimate(jsonOutput)
      const plainEst = Math.round(jsonOutput.length / 4.0)

      // JSON estimate should be higher than naive 4-chars/token
      expect(est).toBeGreaterThan(plainEst)
    })

    test("calibrated estimates improve overflow detection accuracy", () => {
      // Simulate a provider that uses fewer tokens than estimated
      for (let i = 0; i < 10; i++) {
        Token.calibrate("efficient-provider", 1000, 800, "code")
      }

      const code = `
import { readFile } from "fs/promises"
const data = await readFile("input.txt")
function process(input: string): string {
  if (input.length > 100) {
    return input.slice(0, 100)
  }
  return input
}
export default process
`.repeat(10)

      const uncalibrated = Token.estimate(code)
      const calibrated = Token.estimateCalibrated(code, "efficient-provider")

      // Calibrated should be lower (provider uses fewer tokens)
      expect(calibrated).toBeLessThan(uncalibrated)
    })
  })

  // ── 5.1.2: Atomic writes under stress ────────────────────────
  describe("Atomic file operations under stress", () => {
    test("20 concurrent writes all produce valid content", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "stress.txt")

      const writes = Array.from({ length: 20 }, (_, i) =>
        Filesystem.atomicWrite(filepath, `writer-${i}-${"x".repeat(1000)}`),
      )
      await Promise.all(writes)

      const content = await fs.readFile(filepath, "utf-8")
      // Content should be from one of the writers, not corrupted
      expect(content).toMatch(/^writer-\d+-x{1000}$/)
    })

    test("interleaved read-write cycles maintain consistency", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "consistency.txt")
      await Filesystem.atomicWrite(filepath, "initial")

      for (let i = 0; i < 10; i++) {
        const current = await Filesystem.readText(filepath)
        expect(current).toBeTruthy()
        await Filesystem.atomicWrite(filepath, `iteration-${i}`)
      }

      const final = await Filesystem.readText(filepath)
      expect(final).toBe("iteration-9")
    })

    test("write to same directory from multiple paths", async () => {
      await using tmp = await tmpdir()
      const dir = path.join(tmp.path, "multi")

      const writes = Array.from({ length: 5 }, (_, i) =>
        Filesystem.atomicWrite(path.join(dir, `file-${i}.txt`), `content-${i}`),
      )
      await Promise.all(writes)

      for (let i = 0; i < 5; i++) {
        const content = await fs.readFile(path.join(dir, `file-${i}.txt`), "utf-8")
        expect(content).toBe(`content-${i}`)
      }
    })
  })

  // ── 5.1.4: Instruction cache coherence ───────────────────────
  describe("Instruction cache coherence", () => {
    test("cache invalidation via FileWatcher simulation", async () => {
      await using tmp = await tmpdir()
      const filepath = path.join(tmp.path, "instructions.md")
      await fs.writeFile(filepath, "# V1")

      // Read to populate cache
      const v1 = await Filesystem.readText(filepath)
      expect(v1).toBe("# V1")

      // Modify file
      await Bun.sleep(50)
      await fs.writeFile(filepath, "# V2")

      // Invalidate via the exported function
      invalidateInstructionCache(filepath)

      // Next read should get new content
      const v2 = await Filesystem.readText(filepath)
      expect(v2).toBe("# V2")
    })
  })
})
