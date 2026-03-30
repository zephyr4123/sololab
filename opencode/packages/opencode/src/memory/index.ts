import z from "zod"
import { Database, eq, and, desc, sql, lt } from "@/storage/db"
import { MemoryTable } from "./memory.sql"
import { MemoryID, MemoryType } from "./schema"
import type { ProjectID } from "../project/schema"
import type { SessionID } from "../session/schema"
import { Instance } from "../project/instance"
import { Log } from "../util/log"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { fn } from "@/util/fn"

export namespace Memory {
  const log = Log.create({ service: "memory" })

  // Decay: confidence drops ~5% per week of non-access
  const DECAY_RATE_PER_WEEK = 0.05
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
  // Minimum confidence before auto-pruning
  const MIN_CONFIDENCE = 10
  // FTS similarity threshold for dedup (Jaccard on tags)
  const DEDUP_SIMILARITY_THRESHOLD = 0.8
  // Max memories to inject into system prompt
  export const MAX_INJECT = 20
  // Max tokens for memory injection block
  export const MAX_INJECT_TOKENS = 500

  export const Event = {
    Created: BusEvent.define("memory.created", z.object({ memoryID: MemoryID.zod })),
    Updated: BusEvent.define("memory.updated", z.object({ memoryID: MemoryID.zod })),
    Deleted: BusEvent.define("memory.deleted", z.object({ memoryID: MemoryID.zod })),
    Deduplicated: BusEvent.define(
      "memory.deduplicated",
      z.object({ kept: MemoryID.zod, merged: MemoryID.zod }),
    ),
  }

  export interface Info {
    id: MemoryID
    projectID: ProjectID
    type: MemoryType
    content: string
    tags: string[]
    sourceSession?: SessionID
    confidence: number
    accessCount: number
    timeCreated: number
    timeUpdated: number
    timeAccessed?: number
  }

  function rowToInfo(row: typeof MemoryTable.$inferSelect): Info {
    return {
      id: row.id,
      projectID: row.project_id,
      type: row.type,
      content: row.content,
      tags: row.tags,
      sourceSession: row.source_session ?? undefined,
      confidence: row.confidence,
      accessCount: row.access_count,
      timeCreated: row.time_created,
      timeUpdated: row.time_updated,
      timeAccessed: row.time_accessed ?? undefined,
    }
  }

  /** Compute decayed confidence based on time since last access */
  export function decayedConfidence(info: {
    confidence: number
    timeAccessed?: number
    timeCreated: number
  }): number {
    const lastActive = info.timeAccessed ?? info.timeCreated
    const elapsed = Date.now() - lastActive
    const weeks = elapsed / MS_PER_WEEK
    return Math.max(0, info.confidence * Math.pow(1 - DECAY_RATE_PER_WEEK, weeks))
  }

  /** Relevance score combining confidence, access frequency, and recency */
  export function relevanceScore(info: Info): number {
    const decayed = decayedConfidence(info)
    // log(accessCount + 1) for diminishing returns on repeated access
    const accessBoost = Math.log2(info.accessCount + 1)
    return decayed * (1 + accessBoost * 0.1)
  }

  /** Jaccard similarity between two tag sets */
  export function tagSimilarity(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 1
    const setA = new Set(a.map((t) => t.toLowerCase()))
    const setB = new Set(b.map((t) => t.toLowerCase()))
    let intersection = 0
    for (const tag of setA) {
      if (setB.has(tag)) intersection++
    }
    const union = setA.size + setB.size - intersection
    return union === 0 ? 1 : intersection / union
  }

  /** Extract keyword tags from content */
  export function extractTags(content: string): string[] {
    // Remove common stop words, extract meaningful tokens
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "shall", "can", "to", "of", "in", "for",
      "on", "with", "at", "by", "from", "as", "into", "through", "during",
      "before", "after", "above", "below", "between", "this", "that",
      "these", "those", "it", "its", "and", "or", "but", "not", "no",
      "if", "then", "than", "so", "up", "out", "about", "just", "also",
      "very", "when", "what", "which", "who", "how", "all", "each",
      "every", "both", "few", "more", "most", "other", "some", "such",
      "only", "own", "same", "too", "here", "there", "where", "why",
      "的", "了", "在", "是", "和", "与", "或", "但", "不", "也",
      "就", "都", "会", "对", "中", "上", "下", "把", "被", "让",
    ])

    const words = content
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\-\.\/]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))

    // Deduplicate and limit
    const unique = [...new Set(words)]
    return unique.slice(0, 20)
  }

  // --- CRUD Operations ---

  export const create = fn(
    z.object({
      projectID: z.string(),
      type: MemoryType,
      content: z.string().min(1),
      tags: z.string().array().optional(),
      sourceSession: z.string().optional(),
      confidence: z.number().min(0).max(100).optional(),
    }),
    async (input) => {
      const id = MemoryID.ascending()
      const tags = input.tags ?? extractTags(input.content)
      const now = Date.now()

      // Check for duplicates before inserting
      const existing = await search({
        projectID: input.projectID as ProjectID,
        query: input.content,
        limit: 5,
      })

      for (const mem of existing) {
        const sim = tagSimilarity(tags, mem.tags)
        if (sim > DEDUP_SIMILARITY_THRESHOLD) {
          // Merge: update existing with higher confidence
          const merged = {
            ...mem,
            confidence: Math.min(100, Math.max(mem.confidence, input.confidence ?? 95)),
            accessCount: mem.accessCount + 1,
            timeAccessed: now,
          }
          await update({ id: mem.id, confidence: merged.confidence })
          log.info("deduplicated", { kept: mem.id, new: id })
          Bus.publish(Event.Deduplicated, { kept: mem.id, merged: id })
          return mem
        }
      }

      Database.use((db) => {
        db.insert(MemoryTable)
          .values({
            id,
            project_id: input.projectID as ProjectID,
            type: input.type,
            content: input.content,
            tags,
            source_session: (input.sourceSession as SessionID) ?? null,
            confidence: input.confidence ?? 95,
            access_count: 0,
            time_created: now,
            time_updated: now,
            time_accessed: null,
          })
          .run()
      })

      log.info("created", { id, type: input.type })
      Bus.publish(Event.Created, { memoryID: id })
      return { id, projectID: input.projectID, type: input.type, content: input.content, tags, confidence: input.confidence ?? 95, accessCount: 0, timeCreated: now, timeUpdated: now } as Info
    },
  )

  export async function get(id: MemoryID): Promise<Info | undefined> {
    return Database.use((db) => {
      const row = db.select().from(MemoryTable).where(eq(MemoryTable.id, id)).get()
      return row ? rowToInfo(row) : undefined
    })
  }

  export const update = fn(
    z.object({
      id: z.string(),
      content: z.string().optional(),
      type: MemoryType.optional(),
      tags: z.string().array().optional(),
      confidence: z.number().min(0).max(100).optional(),
    }),
    async (input) => {
      const updates: Partial<typeof MemoryTable.$inferInsert> = {
        time_updated: Date.now(),
      }
      if (input.content !== undefined) {
        updates.content = input.content
        updates.tags = input.tags ?? extractTags(input.content)
      }
      if (input.type !== undefined) updates.type = input.type
      if (input.tags !== undefined) updates.tags = input.tags
      if (input.confidence !== undefined) updates.confidence = input.confidence

      Database.use((db) => {
        db.update(MemoryTable)
          .set(updates)
          .where(eq(MemoryTable.id, input.id as MemoryID))
          .run()
      })

      Bus.publish(Event.Updated, { memoryID: input.id as MemoryID })
    },
  )

  export async function remove(id: MemoryID): Promise<void> {
    Database.use((db) => {
      db.delete(MemoryTable).where(eq(MemoryTable.id, id)).run()
    })
    Bus.publish(Event.Deleted, { memoryID: id })
  }

  // --- Search & Query ---

  export async function search(input: {
    projectID: ProjectID
    query?: string
    type?: MemoryType
    limit?: number
  }): Promise<Info[]> {
    const limit = input.limit ?? MAX_INJECT

    return Database.use((db) => {
      if (input.query && input.query.trim()) {
        // FTS5 search — use a safe query string
        const ftsQuery = input.query
          .replace(/['"]/g, "")
          .split(/\s+/)
          .filter((w) => w.length > 1)
          .map((w) => `"${w}"`)
          .join(" OR ")

        if (!ftsQuery) {
          return listByProject(input.projectID, input.type, limit)
        }

        try {
          const rows = db
            .select()
            .from(MemoryTable)
            .where(
              and(
                eq(MemoryTable.project_id, input.projectID),
                input.type ? eq(MemoryTable.type, input.type) : undefined,
                sql`${MemoryTable.id} IN (
                  SELECT m.id FROM memory m
                  INNER JOIN memory_fts ON memory_fts.rowid = m.rowid
                  WHERE memory_fts MATCH ${ftsQuery}
                )`,
              ),
            )
            .limit(limit * 2) // over-fetch for scoring
            .all()

          const results = rows.map(rowToInfo)
          // Touch access counts
          for (const r of results) {
            touchAccess(db, r.id)
          }
          // Score and sort by relevance
          return results
            .map((r) => ({ ...r, _score: relevanceScore(r) }))
            .sort((a, b) => b._score - a._score)
            .slice(0, limit)
        } catch {
          // FTS parse error fallback
          return listByProject(input.projectID, input.type, limit)
        }
      }

      return listByProject(input.projectID, input.type, limit)
    })
  }

  function listByProject(projectID: ProjectID, type?: MemoryType, limit = MAX_INJECT): Info[] {
    return Database.use((db) => {
      const rows = db
        .select()
        .from(MemoryTable)
        .where(
          and(
            eq(MemoryTable.project_id, projectID),
            type ? eq(MemoryTable.type, type) : undefined,
          ),
        )
        .orderBy(desc(MemoryTable.confidence), desc(MemoryTable.access_count))
        .limit(limit)
        .all()

      return rows.map(rowToInfo)
    })
  }

  function touchAccess(db: any, id: MemoryID) {
    try {
      db.update(MemoryTable)
        .set({
          access_count: sql`${MemoryTable.access_count} + 1`,
          time_accessed: Date.now(),
        })
        .where(eq(MemoryTable.id, id))
        .run()
    } catch {
      // Non-critical, log and continue
    }
  }

  /** List all memories for a project */
  export async function list(projectID: ProjectID): Promise<Info[]> {
    return Database.use((db) => {
      const rows = db
        .select()
        .from(MemoryTable)
        .where(eq(MemoryTable.project_id, projectID))
        .orderBy(desc(MemoryTable.time_created))
        .all()
      return rows.map(rowToInfo)
    })
  }

  /** Count memories for a project */
  export async function count(projectID: ProjectID): Promise<number> {
    return Database.use((db) => {
      const result = db
        .select({ count: sql<number>`count(*)` })
        .from(MemoryTable)
        .where(eq(MemoryTable.project_id, projectID))
        .get()
      return result?.count ?? 0
    })
  }

  // --- Memory Injection ---

  /** Build memory block for system prompt injection */
  export async function buildPromptBlock(projectID: ProjectID, query?: string): Promise<string> {
    const memories = await search({
      projectID,
      query,
      limit: MAX_INJECT,
    })

    if (memories.length === 0) return ""

    // Filter by decayed confidence
    const relevant = memories.filter((m) => decayedConfidence(m) >= MIN_CONFIDENCE)
    if (relevant.length === 0) return ""

    const lines = relevant.map((m) => `- [${m.type}] ${m.content}`)

    // Trim to MAX_INJECT_TOKENS (rough: 4 chars/token)
    let block = lines.join("\n")
    const estimatedTokens = block.length / 4
    if (estimatedTokens > MAX_INJECT_TOKENS) {
      // Trim lines from end until within budget
      while (lines.length > 1) {
        lines.pop()
        block = lines.join("\n")
        if (block.length / 4 <= MAX_INJECT_TOKENS) break
      }
    }

    return [
      "<project-memory>",
      "The following are memories from previous sessions that may be relevant:",
      block,
      "</project-memory>",
    ].join("\n")
  }

  // --- Maintenance ---

  /** Prune memories with confidence below threshold */
  export async function prune(projectID: ProjectID): Promise<number> {
    return Database.use((db) => {
      const lowConfidence = db
        .select()
        .from(MemoryTable)
        .where(
          and(eq(MemoryTable.project_id, projectID), lt(MemoryTable.confidence, MIN_CONFIDENCE)),
        )
        .all()

      // Also prune memories whose decayed confidence is below threshold
      const toPrune = lowConfidence.filter(
        (row) =>
          decayedConfidence({
            confidence: row.confidence,
            timeAccessed: row.time_accessed ?? undefined,
            timeCreated: row.time_created,
          }) < MIN_CONFIDENCE,
      )

      for (const row of toPrune) {
        db.delete(MemoryTable).where(eq(MemoryTable.id, row.id)).run()
      }

      return toPrune.length
    })
  }

  // --- Extraction from Compaction ---

  /** Extract memory entries from a compaction summary text */
  export function extractFromCompaction(summary: string): { type: MemoryType; content: string }[] {
    const entries: { type: MemoryType; content: string }[] = []

    // Parse structured sections from compaction template
    const sections: Record<string, MemoryType> = {
      "## Discoveries": "discovery",
      "## Relevant files": "file_knowledge",
      "## Instructions": "preference",
    }

    for (const [header, type] of Object.entries(sections)) {
      const idx = summary.indexOf(header)
      if (idx === -1) continue

      const nextHeader = summary.indexOf("\n## ", idx + header.length)
      const sectionText = nextHeader === -1 ? summary.slice(idx + header.length) : summary.slice(idx + header.length, nextHeader)

      // Extract bullet points
      const bullets = sectionText
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter((l) => l.length > 10)

      for (const bullet of bullets) {
        entries.push({ type, content: bullet })
      }
    }

    return entries
  }

  /** Extract memory entries from session end (diff, decisions, corrections) */
  export function extractFromSessionEnd(messages: Array<{
    role: string
    parts: Array<{ type: string; text?: string; tool?: string; state?: any }>
  }>): { type: MemoryType; content: string }[] {
    const entries: { type: MemoryType; content: string }[] = []
    const filesModified = new Set<string>()

    for (const msg of messages) {
      for (const part of msg.parts) {
        // Track file modifications
        if (part.type === "tool" && part.state?.status === "completed") {
          const tool = part.tool
          if (tool === "edit" || tool === "write") {
            const filePath = part.state?.input?.file_path || part.state?.input?.filepath
            if (filePath) filesModified.add(filePath)
          }
        }
      }
    }

    // Create file knowledge entries for modified files
    if (filesModified.size > 0 && filesModified.size <= 10) {
      entries.push({
        type: "file_knowledge",
        content: `Files modified in session: ${[...filesModified].join(", ")}`,
      })
    }

    return entries
  }
}
