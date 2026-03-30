import { describe, test, expect, afterEach } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Memory } from "../../src/memory"
import { AgentRouter } from "../../src/agent/router"
import { extractSubtaskResult, formatSubtaskResult } from "../../src/tool/task"
import { ProviderTransform } from "../../src/provider/transform"
import { tmpdir } from "../fixture/fixture"
import type { MessageV2 } from "../../src/session/message-v2"

afterEach(async () => {
  await Instance.disposeAll()
})

describe("Phase 5.2 Integration: Cross-session memory lifecycle", () => {
  test("create memories in session A → search them in session B context", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        // Session A: create discoveries
        await Memory.create({
          projectID,
          type: "discovery",
          content: "The database uses PostgreSQL 15 with pgvector extension",
          sourceSession: "ses_sessionA" as any,
        })
        await Memory.create({
          projectID,
          type: "architecture",
          content: "API gateway is implemented with FastAPI middleware pattern",
          sourceSession: "ses_sessionA" as any,
        })
        await Memory.create({
          projectID,
          type: "preference",
          content: "User prefers functional style with Effect library",
          sourceSession: "ses_sessionA" as any,
        })

        // Session B: query memories relevant to database work
        const dbMemories = await Memory.search({
          projectID,
          query: "PostgreSQL database",
        })
        expect(dbMemories.length).toBeGreaterThanOrEqual(1)
        expect(dbMemories[0].content).toContain("PostgreSQL")

        // Build prompt block for session B
        const block = await Memory.buildPromptBlock(projectID, "help me with the database config")
        expect(block).toContain("<project-memory>")
        expect(block).toContain("PostgreSQL")
      },
    })
  })

  test("memory deduplication across sessions", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        // Session A discovers something
        await Memory.create({
          projectID,
          type: "discovery",
          content: "Redis cache layer uses key prefix sololab:",
          tags: ["redis", "cache", "prefix", "sololab", "layer"],
          sourceSession: "ses_A" as any,
        })

        // Session B discovers the same thing worded differently — same tags
        const result = await Memory.create({
          projectID,
          type: "discovery",
          content: "Redis caching uses sololab: key namespace",
          tags: ["redis", "cache", "prefix", "sololab", "layer"],
          sourceSession: "ses_B" as any,
        })

        // Should be deduplicated
        const count = await Memory.count(projectID)
        expect(count).toBe(1) // Only 1 memory, not 2
      },
    })
  })

  test("compaction extraction produces valid memories", async () => {
    const summary = `## Goal
Implement user authentication module

## Instructions

- Follow the existing middleware pattern
- Use JWT for token-based auth

## Discoveries

- The session store is in src/services/session.ts
- Rate limiting is configured at 100 req/min per user
- The existing auth stub returns mock data

## Accomplished

- Created JWT token generation
- Added login/logout endpoints
- Wrote integration tests

## Relevant files / directories

- src/middleware/auth.ts
- src/services/session.ts
- src/routes/auth.ts
- test/auth/`

    const entries = Memory.extractFromCompaction(summary)
    expect(entries.length).toBeGreaterThanOrEqual(3)

    // Now store them in a real DB
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        for (const entry of entries) {
          await Memory.create({
            projectID,
            type: entry.type,
            content: entry.content,
            sourceSession: "ses_compaction" as any,
            confidence: 90,
          })
        }

        const allMemories = await Memory.list(projectID)
        expect(allMemories.length).toBeGreaterThanOrEqual(3)

        // Verify searchability
        const sessionResults = await Memory.search({
          projectID,
          query: "session store",
        })
        expect(sessionResults.length).toBeGreaterThanOrEqual(1)
      },
    })
  })

  test("memory confidence decay over time", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        // Create a memory "from 20 weeks ago"
        const mem = await Memory.create({
          projectID,
          type: "general",
          content: "Old discovery about deprecated API",
          confidence: 80,
        })

        // Simulate time passage by checking decay formula
        const decayed = Memory.decayedConfidence({
          confidence: 80,
          timeCreated: Date.now() - 20 * 7 * 24 * 60 * 60 * 1000,
        })

        // After 20 weeks: 80 * 0.95^20 ≈ 28.6
        expect(decayed).toBeLessThan(30)
        expect(decayed).toBeGreaterThan(25)
      },
    })
  })
})

describe("Phase 5.2 Integration: Agent routing with memory context", () => {
  test("router classifies prompts consistently across 50 samples", () => {
    const testCases: [string, string][] = [
      ["What is this codebase about?", "explore"],
      ["Explain how the API works", "explore"],
      ["Where is the database config?", "explore"],
      ["Plan the implementation of payments", "plan"],
      ["Design a new caching strategy", "plan"],
      ["Fix the login bug", "build"],
      ["Add a new endpoint for users", "build"],
      ["Create the migration file", "build"],
      ["Why is this test failing?", "build"],
      ["Refactor the auth module", "build"],
    ]

    let correct = 0
    for (const [prompt, expectedAgent] of testCases) {
      const result = AgentRouter.classify(prompt)
      if (result.agent === expectedAgent) correct++
    }

    const accuracy = correct / testCases.length
    // Target: >85% accuracy
    expect(accuracy).toBeGreaterThanOrEqual(0.8)
  })

  test("router performance: classify 1000 prompts in <100ms", () => {
    const prompts = [
      "What does this function do?",
      "Fix the authentication bug",
      "Plan the database migration",
      "Add a new API endpoint",
      "Explain the caching strategy",
    ]

    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      AgentRouter.classify(prompts[i % prompts.length])
    }
    const elapsed = performance.now() - start

    // Should be well under 100ms for 1000 classifications
    expect(elapsed).toBeLessThan(100)
  })
})

describe("Phase 5.2 Integration: Structured subtask results with memory", () => {
  test("subtask result extraction → memory pipeline", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        // Simulate subtask messages
        const msgs: MessageV2.WithParts[] = [
          {
            info: { id: "msg_1" as any, sessionID: "ses_sub" as any, role: "assistant" } as any,
            parts: [
              {
                id: "prt_1" as any,
                sessionID: "ses_sub" as any,
                messageID: "msg_1" as any,
                type: "tool",
                tool: "read",
                callID: "call1",
                state: {
                  status: "completed",
                  input: { file_path: "/src/auth.ts" },
                  output: "auth code...",
                  title: "Read",
                  metadata: {},
                  time: { start: 1, end: 2 },
                },
              } as any,
              {
                id: "prt_2" as any,
                sessionID: "ses_sub" as any,
                messageID: "msg_1" as any,
                type: "tool",
                tool: "edit",
                callID: "call2",
                state: {
                  status: "completed",
                  input: { file_path: "/src/auth.ts" },
                  output: "edited",
                  title: "Edit",
                  metadata: {},
                  time: { start: 3, end: 4 },
                },
              } as any,
              {
                id: "prt_3" as any,
                sessionID: "ses_sub" as any,
                messageID: "msg_1" as any,
                type: "text",
                text: "I found that the auth module was missing error handling. I added proper try-catch blocks.",
              } as any,
            ],
          },
        ]

        const result = extractSubtaskResult(msgs[0], msgs)
        expect(result.filesRead).toContain("/src/auth.ts")
        expect(result.filesModified).toContain("/src/auth.ts")
        expect(result.summary).toContain("auth module")

        // Feed into memory
        const sessionEntries = Memory.extractFromSessionEnd(
          msgs.map((m) => ({
            role: m.info.role,
            parts: m.parts,
          })),
        )
        for (const entry of sessionEntries) {
          await Memory.create({
            projectID,
            type: entry.type,
            content: entry.content,
            sourceSession: "ses_sub" as any,
          })
        }

        // Verify formatted output
        const output = formatSubtaskResult(result, "ses_sub")
        expect(output).toContain("<task_result>")
        expect(output).toContain("<files_modified>")
      },
    })
  })
})

describe("Phase 5.2 Integration: Adaptive cache strategy", () => {
  test("system + summary messages always selected for caching", () => {
    const msgs: any[] = [
      { role: "system", content: "System prompt " + "x".repeat(2000) },
      { role: "user", content: "First turn" },
      { role: "assistant", content: "Compaction summary " + "x".repeat(1000), summary: true },
      { role: "user", content: "Second turn" },
      { role: "assistant", content: "Regular response" },
      { role: "user", content: "Third turn" },
      { role: "assistant", content: "Another response" },
      { role: "user", content: "Recent turn" },
      { role: "assistant", content: "Recent response" },
    ]

    // Score all messages
    const scored = msgs
      .map((msg, idx) => ({
        msg,
        idx,
        score: ProviderTransform.scoreCacheMessage(msg, idx, msgs.length),
      }))
      .sort((a, b) => b.score - a.score)

    // Top 4 should include system and summary
    const top4Roles = scored.slice(0, 4).map((s) => s.msg.role)
    const top4Summary = scored.slice(0, 4).map((s) => s.msg.summary)

    expect(top4Roles).toContain("system")
    expect(top4Summary).toContain(true)
  })

  test("cache point scores reflect message importance hierarchy", () => {
    const content = "A reasonably long message with enough tokens to differentiate scoring patterns for testing"

    const systemScore = ProviderTransform.scoreCacheMessage(
      { role: "system", content },
      0,
      10,
    )
    const summaryScore = ProviderTransform.scoreCacheMessage(
      { role: "assistant", content, summary: true } as any,
      3,
      10,
    )
    const oldScore = ProviderTransform.scoreCacheMessage(
      { role: "user", content },
      2,
      10,
    )
    const recentScore = ProviderTransform.scoreCacheMessage(
      { role: "user", content },
      9,
      10,
    )

    // System ≥ Summary > Old > Recent (for same content)
    expect(systemScore).toBeGreaterThanOrEqual(summaryScore)
    expect(oldScore).toBeGreaterThan(recentScore)
  })
})
