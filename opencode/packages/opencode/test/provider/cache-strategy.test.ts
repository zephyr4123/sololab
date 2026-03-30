import { describe, test, expect } from "bun:test"
import { ProviderTransform } from "../../src/provider/transform"

describe("ProviderTransform.scoreCacheMessage", () => {
  test("system messages get highest stability", () => {
    const score = ProviderTransform.scoreCacheMessage(
      { role: "system", content: "You are a helpful assistant with a long system prompt..." },
      0,
      10,
    )
    // stability=1.0 × log(tokens+1) > 0
    expect(score).toBeGreaterThan(0)
  })

  test("system messages score higher than recent user messages", () => {
    const systemScore = ProviderTransform.scoreCacheMessage(
      { role: "system", content: "Long system prompt " + "x".repeat(500) },
      0,
      10,
    )
    const recentScore = ProviderTransform.scoreCacheMessage(
      { role: "user", content: "Short recent message" },
      9, // last message
      10,
    )
    expect(systemScore).toBeGreaterThan(recentScore)
  })

  test("compaction summaries (summary=true) get stability=1.0", () => {
    const summaryMsg = {
      role: "assistant" as const,
      content: "## Goal\nImplement auth module\n## Discoveries\n...",
      summary: true,
    }
    const regularMsg = {
      role: "assistant" as const,
      content: "## Goal\nImplement auth module\n## Discoveries\n...",
    }

    const summaryScore = ProviderTransform.scoreCacheMessage(summaryMsg, 3, 10)
    const regularScore = ProviderTransform.scoreCacheMessage(regularMsg, 9, 10) // recent
    // Summary has stability=1.0 vs regular's 0.5
    expect(summaryScore).toBeGreaterThan(regularScore)
  })

  test("older messages (not last 2) get stability=0.9", () => {
    const oldScore = ProviderTransform.scoreCacheMessage(
      { role: "user", content: "Older message with reasonable length content..." },
      3, // older
      10,
    )
    const recentScore = ProviderTransform.scoreCacheMessage(
      { role: "user", content: "Recent message with reasonable length content..." },
      9, // recent (last 2)
      10,
    )
    // Older gets 0.9 vs recent's 0.5 for same content
    expect(oldScore).toBeGreaterThan(recentScore)
  })

  test("longer content scores higher than shorter (same position)", () => {
    const longScore = ProviderTransform.scoreCacheMessage(
      { role: "user", content: "A ".repeat(500) },
      3,
      10,
    )
    const shortScore = ProviderTransform.scoreCacheMessage(
      { role: "user", content: "Short" },
      3,
      10,
    )
    expect(longScore).toBeGreaterThan(shortScore)
  })

  test("empty content scores ~0", () => {
    const score = ProviderTransform.scoreCacheMessage(
      { role: "user", content: "" },
      0,
      10,
    )
    // log(0 + 1) = 0, so score should be 0
    expect(score).toBe(0)
  })

  test("handles array content", () => {
    const score = ProviderTransform.scoreCacheMessage(
      {
        role: "user",
        content: [
          { type: "text", text: "Hello world this is a test message" },
          { type: "text", text: "With multiple content parts for the model" },
        ],
      } as any,
      0,
      5,
    )
    expect(score).toBeGreaterThan(0)
  })
})

describe("adaptive cache point selection", () => {
  test("selects top-N messages by score", () => {
    // Create a message array
    const msgs: any[] = [
      { role: "system", content: "Long system prompt " + "x".repeat(1000) },
      { role: "user", content: "First user message about architecture" },
      { role: "assistant", content: "Response about architecture", summary: true },
      { role: "user", content: "Second user message" },
      { role: "assistant", content: "Second response" },
      { role: "user", content: "Recent user message" },
      { role: "assistant", content: "Recent response" },
    ]

    // Score all and verify system + summary are highest
    const scored = msgs.map((msg, idx) => ({
      msg,
      score: ProviderTransform.scoreCacheMessage(msg, idx, msgs.length),
    }))

    scored.sort((a, b) => b.score - a.score)

    // System message should be top-1
    expect(scored[0].msg.role).toBe("system")
    // Compaction summary should be top-2
    expect(scored[1].msg.summary).toBe(true)
  })

  test("scoring is deterministic", () => {
    const msg = { role: "system" as const, content: "Test content for determinism check" }
    const score1 = ProviderTransform.scoreCacheMessage(msg, 0, 5)
    const score2 = ProviderTransform.scoreCacheMessage(msg, 0, 5)
    expect(score1).toBe(score2)
  })
})
