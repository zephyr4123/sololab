import path from "path"
import os from "os"
import { Global } from "../global"
import { Filesystem } from "../util/filesystem"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Flag } from "@/flag/flag"
import { Log } from "../util/log"
import { Glob } from "../util/glob"
import { Bus } from "../bus"
import { FileWatcher } from "../file/watcher"
import type { MessageV2 } from "./message-v2"

const log = Log.create({ service: "instruction" })

// ── Instruction File Cache ──────────────────────────────────────────
// Caches file contents keyed by path + mtime, with a 30s TTL.
// FileWatcher events invalidate entries immediately when available.

interface FileCacheEntry {
  content: string
  mtime: number
  cachedAt: number
}

const FILE_CACHE_TTL = 30_000 // 30 seconds

const fileCache = new Map<string, FileCacheEntry>()

function getFileCache(filepath: string): string | undefined {
  const entry = fileCache.get(filepath)
  if (!entry) return undefined

  const now = Date.now()
  if (now - entry.cachedAt > FILE_CACHE_TTL) {
    fileCache.delete(filepath)
    return undefined
  }

  // Validate mtime hasn't changed
  const stat = Filesystem.stat(filepath)
  if (!stat) {
    fileCache.delete(filepath)
    return undefined
  }
  const currentMtime = stat.mtime?.getTime() ?? 0
  if (currentMtime !== entry.mtime) {
    fileCache.delete(filepath)
    return undefined
  }

  return entry.content
}

function setFileCache(filepath: string, content: string): void {
  const stat = Filesystem.stat(filepath)
  const mtime = stat?.mtime?.getTime() ?? 0
  fileCache.set(filepath, { content, mtime, cachedAt: Date.now() })
}

/** Invalidate cache for a specific file (called by FileWatcher). */
export function invalidateInstructionCache(filepath: string): void {
  fileCache.delete(filepath)
}

/** Clear all instruction caches (useful for testing). */
export function clearInstructionCache(): void {
  fileCache.clear()
  httpCache.clear()
}

// ── HTTP Instruction Cache ──────────────────────────────────────────
// Caches HTTP responses with ETag/Last-Modified conditional requests.

interface HttpCacheEntry {
  content: string
  etag?: string
  lastModified?: string
  cachedAt: number
}

const HTTP_CACHE_TTL = 30_000 // 30 seconds

const httpCache = new Map<string, HttpCacheEntry>()

const FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md", // deprecated
]

function globalFiles() {
  const files = []
  if (Flag.OPENCODE_CONFIG_DIR) {
    files.push(path.join(Flag.OPENCODE_CONFIG_DIR, "AGENTS.md"))
  }
  files.push(path.join(Global.Path.config, "AGENTS.md"))
  if (!Flag.OPENCODE_DISABLE_CLAUDE_CODE_PROMPT) {
    files.push(path.join(os.homedir(), ".claude", "CLAUDE.md"))
  }
  return files
}

async function resolveRelative(instruction: string): Promise<string[]> {
  if (!Flag.OPENCODE_DISABLE_PROJECT_CONFIG) {
    return Filesystem.globUp(instruction, Instance.directory, Instance.worktree).catch(() => [])
  }
  if (!Flag.OPENCODE_CONFIG_DIR) {
    log.warn(
      `Skipping relative instruction "${instruction}" - no OPENCODE_CONFIG_DIR set while project config is disabled`,
    )
    return []
  }
  return Filesystem.globUp(instruction, Flag.OPENCODE_CONFIG_DIR, Flag.OPENCODE_CONFIG_DIR).catch(() => [])
}

export namespace InstructionPrompt {
  const state = Instance.state(() => {
    return {
      claims: new Map<string, Set<string>>(),
    }
  })

  function isClaimed(messageID: string, filepath: string) {
    const claimed = state().claims.get(messageID)
    if (!claimed) return false
    return claimed.has(filepath)
  }

  function claim(messageID: string, filepath: string) {
    const current = state()
    let claimed = current.claims.get(messageID)
    if (!claimed) {
      claimed = new Set()
      current.claims.set(messageID, claimed)
    }
    claimed.add(filepath)
  }

  export function clear(messageID: string) {
    state().claims.delete(messageID)
  }

  export async function systemPaths() {
    const config = await Config.get()
    const paths = new Set<string>()

    if (!Flag.OPENCODE_DISABLE_PROJECT_CONFIG) {
      for (const file of FILES) {
        const matches = await Filesystem.findUp(file, Instance.directory, Instance.worktree)
        if (matches.length > 0) {
          matches.forEach((p) => {
            paths.add(path.resolve(p))
          })
          break
        }
      }
    }

    for (const file of globalFiles()) {
      if (await Filesystem.exists(file)) {
        paths.add(path.resolve(file))
        break
      }
    }

    if (config.instructions) {
      for (let instruction of config.instructions) {
        if (instruction.startsWith("https://") || instruction.startsWith("http://")) continue
        if (instruction.startsWith("~/")) {
          instruction = path.join(os.homedir(), instruction.slice(2))
        }
        const matches = path.isAbsolute(instruction)
          ? await Glob.scan(path.basename(instruction), {
              cwd: path.dirname(instruction),
              absolute: true,
              include: "file",
            }).catch(() => [])
          : await resolveRelative(instruction)
        matches.forEach((p) => {
          paths.add(path.resolve(p))
        })
      }
    }

    return paths
  }

  export async function system() {
    const config = await Config.get()
    const paths = await systemPaths()

    const files = Array.from(paths).map(async (p) => {
      // Check file cache first (path + mtime keyed, TTL 30s)
      const cached = getFileCache(p)
      if (cached !== undefined) {
        return cached ? "Instructions from: " + p + "\n" + cached : ""
      }
      const content = await Filesystem.readText(p).catch(() => "")
      if (content) setFileCache(p, content)
      return content ? "Instructions from: " + p + "\n" + content : ""
    })

    const urls: string[] = []
    if (config.instructions) {
      for (const instruction of config.instructions) {
        if (instruction.startsWith("https://") || instruction.startsWith("http://")) {
          urls.push(instruction)
        }
      }
    }

    const fetches = urls.map(async (url) => {
      // Check HTTP cache with ETag/Last-Modified conditional requests
      const cachedHttp = httpCache.get(url)
      if (cachedHttp && Date.now() - cachedHttp.cachedAt < HTTP_CACHE_TTL) {
        return cachedHttp.content ? "Instructions from: " + url + "\n" + cachedHttp.content : ""
      }

      try {
        const headers: Record<string, string> = {}
        if (cachedHttp?.etag) headers["If-None-Match"] = cachedHttp.etag
        if (cachedHttp?.lastModified) headers["If-Modified-Since"] = cachedHttp.lastModified

        const res = await fetch(url, {
          signal: AbortSignal.timeout(5000),
          headers,
        })

        if (res.status === 304 && cachedHttp) {
          // Not modified — reuse cached content, refresh timestamp
          cachedHttp.cachedAt = Date.now()
          return cachedHttp.content ? "Instructions from: " + url + "\n" + cachedHttp.content : ""
        }

        if (!res.ok) return ""

        const content = await res.text()
        httpCache.set(url, {
          content,
          etag: res.headers.get("etag") ?? undefined,
          lastModified: res.headers.get("last-modified") ?? undefined,
          cachedAt: Date.now(),
        })
        return content ? "Instructions from: " + url + "\n" + content : ""
      } catch {
        // On network error, return stale cache if available
        if (cachedHttp?.content) {
          return "Instructions from: " + url + "\n" + cachedHttp.content
        }
        return ""
      }
    })

    return Promise.all([...files, ...fetches]).then((result) => result.filter(Boolean))
  }

  export function loaded(messages: MessageV2.WithParts[]) {
    const paths = new Set<string>()
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "tool" && part.tool === "read" && part.state.status === "completed") {
          if (part.state.time.compacted) continue
          const loaded = part.state.metadata?.loaded
          if (!loaded || !Array.isArray(loaded)) continue
          for (const p of loaded) {
            if (typeof p === "string") paths.add(p)
          }
        }
      }
    }
    return paths
  }

  export async function find(dir: string) {
    for (const file of FILES) {
      const filepath = path.resolve(path.join(dir, file))
      if (await Filesystem.exists(filepath)) return filepath
    }
  }

  /** Subscribe to file watcher to invalidate instruction cache on file changes. */
  export function watchForInvalidation(): void {
    Bus.subscribe(FileWatcher.Event.Updated, (event) => {
      const filepath = event.properties.file
      if (filepath) {
        invalidateInstructionCache(filepath)
      }
    })
  }

  export async function resolve(messages: MessageV2.WithParts[], filepath: string, messageID: string) {
    const system = await systemPaths()
    const already = loaded(messages)
    const results: { filepath: string; content: string }[] = []

    const target = path.resolve(filepath)
    let current = path.dirname(target)
    const root = path.resolve(Instance.directory)

    while (current.startsWith(root) && current !== root) {
      const found = await find(current)

      if (found && found !== target && !system.has(found) && !already.has(found) && !isClaimed(messageID, found)) {
        claim(messageID, found)
        const content = await Filesystem.readText(found).catch(() => undefined)
        if (content) {
          results.push({ filepath: found, content: "Instructions from: " + found + "\n" + content })
        }
      }
      current = path.dirname(current)
    }

    return results
  }
}
