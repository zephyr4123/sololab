import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Memory } from "../../src/memory"
import { MemoryID, MemoryType } from "../../src/memory/schema"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await Instance.disposeAll()
})

// --- Tag extraction ---
describe("Memory.extractTags", () => {
  test("extracts meaningful keywords from English text", () => {
    const tags = Memory.extractTags("The authentication middleware uses JWT tokens with RSA-256 signing")
    expect(tags.length).toBeGreaterThan(0)
    expect(tags).toContain("authentication")
    expect(tags).toContain("middleware")
    expect(tags).toContain("jwt")
  })

  test("extracts keywords from Chinese text", () => {
    const tags = Memory.extractTags("认证中间件使用JWT令牌进行RSA-256签名")
    expect(tags.length).toBeGreaterThan(0)
  })

  test("extracts file paths and code identifiers", () => {
    const tags = Memory.extractTags("The config is in src/config/settings.ts and uses ConfigManager class")
    expect(tags).toContain("src/config/settings.ts")
    expect(tags).toContain("configmanager")
  })

  test("limits to 15 tags", () => {
    const longText = Array.from({ length: 100 }, (_, i) => `keyword${i}`).join(" ")
    const tags = Memory.extractTags(longText)
    expect(tags.length).toBeLessThanOrEqual(15)
  })

  test("returns empty array for empty input", () => {
    expect(Memory.extractTags("")).toEqual([])
    expect(Memory.extractTags("  ")).toEqual([])
  })

  test("deduplicates tags", () => {
    const tags = Memory.extractTags("token token token estimation estimation")
    const unique = new Set(tags)
    expect(tags.length).toBe(unique.size)
  })
})

// --- Tag similarity ---
describe("Memory.tagSimilarity", () => {
  test("identical tags return 1.0", () => {
    expect(Memory.tagSimilarity(["a", "b", "c"], ["a", "b", "c"])).toBe(1)
  })

  test("completely different tags return 0.0", () => {
    expect(Memory.tagSimilarity(["a", "b"], ["c", "d"])).toBe(0)
  })

  test("partial overlap returns correct Jaccard", () => {
    // {a, b, c} ∩ {b, c, d} = {b, c} → 2/4 = 0.5
    expect(Memory.tagSimilarity(["a", "b", "c"], ["b", "c", "d"])).toBe(0.5)
  })

  test("case insensitive comparison", () => {
    expect(Memory.tagSimilarity(["Auth", "JWT"], ["auth", "jwt"])).toBe(1)
  })

  test("both empty returns 1.0", () => {
    expect(Memory.tagSimilarity([], [])).toBe(1)
  })

  test("one empty returns 0.0", () => {
    expect(Memory.tagSimilarity(["a"], [])).toBe(0)
    expect(Memory.tagSimilarity([], ["b"])).toBe(0)
  })
})

// --- Confidence decay ---
describe("Memory.decayedConfidence", () => {
  test("no decay for just-created memory", () => {
    const result = Memory.decayedConfidence({
      confidence: 95,
      timeCreated: Date.now(),
    })
    expect(result).toBeCloseTo(95, 0)
  })

  test("decays after 1 week", () => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const result = Memory.decayedConfidence({
      confidence: 100,
      timeCreated: oneWeekAgo,
    })
    // After 1 week: 100 - 1*2 = 98
    expect(result).toBeCloseTo(98, 0)
  })

  test("decays significantly after 10 weeks", () => {
    const tenWeeksAgo = Date.now() - 10 * 7 * 24 * 60 * 60 * 1000
    const result = Memory.decayedConfidence({
      confidence: 100,
      timeCreated: tenWeeksAgo,
    })
    // After 10 weeks: 100 - 10*2 = 80
    expect(result).toBeCloseTo(80, 0)
  })

  test("uses time_accessed if available", () => {
    const recentAccess = Date.now() - 1000 // 1 second ago
    const result = Memory.decayedConfidence({
      confidence: 100,
      timeCreated: Date.now() - 30 * 7 * 24 * 60 * 60 * 1000, // 30 weeks old
      timeAccessed: recentAccess,
    })
    // Recently accessed, so minimal decay
    expect(result).toBeGreaterThan(99)
  })

  test("never goes below 0", () => {
    const veryOld = Date.now() - 365 * 24 * 60 * 60 * 1000 // 1 year
    const result = Memory.decayedConfidence({
      confidence: 10,
      timeCreated: veryOld,
    })
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

// --- Relevance scoring ---
describe("Memory.relevanceScore", () => {
  test("higher confidence yields higher score", () => {
    const now = Date.now()
    const high = Memory.relevanceScore({
      id: MemoryID.ascending(),
      projectID: "global" as any,
      type: "general",
      content: "test",
      tags: [],
      confidence: 95,
      accessCount: 0,
      timeCreated: now,
      timeUpdated: now,
    })
    const low = Memory.relevanceScore({
      id: MemoryID.ascending(),
      projectID: "global" as any,
      type: "general",
      content: "test",
      tags: [],
      confidence: 30,
      accessCount: 0,
      timeCreated: now,
      timeUpdated: now,
    })
    expect(high).toBeGreaterThan(low)
  })

  test("relevanceScore equals decayedConfidence (simplified)", () => {
    const now = Date.now()
    const info = {
      id: MemoryID.ascending(),
      projectID: "global" as any,
      type: "general" as MemoryType,
      content: "test",
      tags: [],
      confidence: 80,
      accessCount: 50,
      timeCreated: now,
      timeUpdated: now,
    }
    expect(Memory.relevanceScore(info)).toBe(Memory.decayedConfidence(info))
  })
})

// --- CRUD operations (requires real DB) ---
describe("Memory CRUD", () => {
  test("create, get, update, delete lifecycle", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        // Create
        const mem = await Memory.create({
          projectID,
          type: "discovery",
          content: "The API uses rate limiting with a 100 req/min window",
          confidence: 90,
        })
        expect(mem.id).toBeDefined()
        expect(mem.type).toBe("discovery")
        expect(mem.tags.length).toBeGreaterThan(0)

        // Get
        const fetched = await Memory.get(mem.id)
        expect(fetched).toBeDefined()
        expect(fetched!.content).toBe("The API uses rate limiting with a 100 req/min window")

        // Update
        await Memory.update({
          id: mem.id,
          content: "The API uses rate limiting with a 200 req/min window",
          confidence: 95,
        })
        const updated = await Memory.get(mem.id)
        expect(updated!.content).toContain("200 req/min")
        expect(updated!.confidence).toBe(95)

        // Delete
        await Memory.remove(mem.id)
        const deleted = await Memory.get(mem.id)
        expect(deleted).toBeUndefined()
      },
    })
  })

  test("list returns all project memories", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        await Memory.create({ projectID, type: "discovery", content: "Finding A about the database schema" })
        await Memory.create({ projectID, type: "discovery", content: "Pattern B for error handling" })
        await Memory.create({ projectID, type: "preference", content: "User prefers verbose logging" })

        const all = await Memory.list(projectID)
        expect(all.length).toBe(3)
      },
    })
  })

  test("count returns correct number", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        expect(await Memory.count(projectID)).toBe(0)
        await Memory.create({ projectID, type: "general", content: "Memory one" })
        await Memory.create({ projectID, type: "general", content: "Memory two" })
        expect(await Memory.count(projectID)).toBe(2)
      },
    })
  })
})

// --- FTS5 search ---
describe("Memory search (FTS5)", () => {
  test("finds memories by content keywords", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        await Memory.create({ projectID, type: "discovery", content: "PostgreSQL uses MVCC for concurrency control" })
        await Memory.create({ projectID, type: "discovery", content: "React components use hooks for state management" })
        await Memory.create({ projectID, type: "general", content: "The build system uses webpack bundler" })

        const results = await Memory.search({ projectID, query: "PostgreSQL concurrency" })
        expect(results.length).toBeGreaterThanOrEqual(1)
        expect(results[0].content).toContain("PostgreSQL")
      },
    })
  })

  test("search with type filter", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        await Memory.create({ projectID, type: "discovery", content: "Found auth uses JWT tokens" })
        await Memory.create({ projectID, type: "preference", content: "Always use snake_case for API endpoints" })

        const results = await Memory.search({ projectID, query: "JWT", type: "discovery" })
        expect(results.length).toBe(1)
        expect(results[0].type).toBe("discovery")
      },
    })
  })

  test("empty query returns all by confidence", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        // Use very different content to avoid dedup
        await Memory.create({
          projectID, type: "general",
          content: "PostgreSQL database uses MVCC concurrency control mechanism",
          tags: ["postgresql", "mvcc", "database"],
          confidence: 50,
        })
        await Memory.create({
          projectID, type: "general",
          content: "React frontend uses hooks pattern for state management",
          tags: ["react", "hooks", "frontend"],
          confidence: 90,
        })

        const results = await Memory.search({ projectID })
        expect(results.length).toBe(2)
        // Higher confidence should come first
        expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence)
      },
    })
  })
})

// --- Deduplication ---
describe("Memory deduplication", () => {
  test("deduplicates when tags similarity > 80%", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        // Create first memory with 5 tags
        const first = await Memory.create({
          projectID,
          type: "discovery",
          content: "The authentication module uses JWT with RSA-256",
          tags: ["authentication", "jwt", "rsa-256", "module", "auth"],
        })

        // Create near-duplicate with 4/5 same tags (Jaccard = 4/6 = 0.67)
        // Need 5/5 shared for >0.8 with 5 tags → use exactly same tags
        const second = await Memory.create({
          projectID,
          type: "discovery",
          content: "Auth module relies on JWT and RSA-256 signing",
          tags: ["authentication", "jwt", "rsa-256", "module", "auth"],
        })

        // Should have been deduplicated — second returns the first's ID
        expect(second.id).toBe(first.id)

        // Only 1 memory in DB
        const count = await Memory.count(projectID)
        expect(count).toBe(1)
      },
    })
  })
})

// --- Memory injection ---
describe("Memory.buildPromptBlock", () => {
  test("returns empty string when no memories", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id
        const block = await Memory.buildPromptBlock(projectID)
        expect(block).toBe("")
      },
    })
  })

  test("returns formatted block with memories", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id
        await Memory.create({ projectID, type: "discovery", content: "The API uses OAuth2 flow" })
        await Memory.create({ projectID, type: "discovery", content: "Error handling uses Result type" })

        const block = await Memory.buildPromptBlock(projectID)
        expect(block).toContain("<project-memory>")
        expect(block).toContain("</project-memory>")
        expect(block).toContain("[discovery]")
        expect(block).toContain("OAuth2")
      },
    })
  })
})

// --- Compaction extraction ---
describe("Memory.extractFromCompaction", () => {
  test("extracts discoveries from compaction summary", () => {
    const summary = `## Goal
Implement user authentication

## Discoveries

- The existing auth middleware is in src/middleware/auth.ts
- Session tokens expire after 24 hours by default
- Redis is used for session storage

## Accomplished

- Implemented JWT token generation
- Added refresh token support

## Relevant files / directories

- src/middleware/auth.ts
- src/config/session.ts
- src/services/redis.ts`

    const entries = Memory.extractFromCompaction(summary)
    expect(entries.length).toBeGreaterThanOrEqual(3)
    // Should have discoveries
    const discoveries = entries.filter((e) => e.type === "discovery")
    expect(discoveries.length).toBeGreaterThanOrEqual(3)
    expect(discoveries[0].content).toContain("auth middleware")
  })

  test("extracts relevant files", () => {
    const summary = `## Relevant files / directories

- src/index.ts
- src/config/database.ts
- src/services/`

    const entries = Memory.extractFromCompaction(summary)
    const fileEntries = entries.filter((e) => e.type === "file_knowledge")
    expect(fileEntries.length).toBeGreaterThanOrEqual(2)
  })

  test("returns empty for unstructured text", () => {
    const entries = Memory.extractFromCompaction("Just some random text without sections")
    expect(entries.length).toBe(0)
  })
})

// --- Session end extraction ---
describe("Memory.extractFromSessionEnd", () => {
  test("extracts modified files from tool parts", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: "edit",
            state: {
              status: "completed",
              input: { file_path: "/src/index.ts" },
              output: "edited",
              title: "Edit file",
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
              title: "Write file",
              metadata: {},
              time: { start: 3, end: 4 },
            },
          },
        ],
      },
    ]

    const entries = Memory.extractFromSessionEnd(messages as any)
    const fileEntries = entries.filter((e) => e.type === "file_knowledge")
    expect(fileEntries.length).toBe(1)
    expect(fileEntries[0].content).toContain("/src/index.ts")
    expect(fileEntries[0].content).toContain("/src/new-file.ts")
  })

  test("returns empty when no tool calls", () => {
    const entries = Memory.extractFromSessionEnd([
      { role: "user", parts: [{ type: "text", text: "Hello" }] },
    ] as any)
    expect(entries.length).toBe(0)
  })
})

// --- Pruning ---
describe("Memory pruning", () => {
  test("prunes low-confidence memories", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const projectID = Instance.current.project.id

        // Create a memory with very low confidence
        await Memory.create({ projectID, type: "general", content: "Low confidence memory", confidence: 5 })
        await Memory.create({ projectID, type: "general", content: "High confidence memory", confidence: 90 })

        expect(await Memory.count(projectID)).toBe(2)
        const pruned = await Memory.prune(projectID)
        expect(pruned).toBe(1)
        expect(await Memory.count(projectID)).toBe(1)

        const remaining = await Memory.list(projectID)
        expect(remaining[0].confidence).toBe(90)
      },
    })
  })
})
