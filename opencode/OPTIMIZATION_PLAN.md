# OpenCode Optimization Plan

> **Version:** 1.0.0
> **Created:** 2026-03-29
> **Status:** Planning
> **Estimated Total Duration:** 12-16 weeks

---

## Table of Contents

- [Overview](#overview)
- [Priority Legend](#priority-legend)
- [Phase 1: Foundation & Performance (Week 1-3)](#phase-1-foundation--performance-week-1-3)
- [Phase 2: Intelligence & Context (Week 4-7)](#phase-2-intelligence--context-week-4-7)
- [Phase 3: Advanced Capabilities (Week 8-12)](#phase-3-advanced-capabilities-week-8-12)
- [Phase 4: Polish & Hardening (Week 13-16)](#phase-4-polish--hardening-week-13-16)
- [Benchmark Suite](#benchmark-suite)
- [Testing Strategy](#testing-strategy)
- [Risk Register](#risk-register)

---

## Overview

This document tracks the comprehensive optimization of OpenCode for integration into a custom project. Every item has:
- **Checkbox** for progress tracking
- **Priority** (P0-P3)
- **Estimated effort**
- **Acceptance criteria**
- **Benchmark requirement**

---

## Priority Legend

| Priority | Meaning | SLA |
|----------|---------|-----|
| **P0** | Critical blocker, must fix first | Week 1-2 |
| **P1** | High-value, core improvement | Week 2-5 |
| **P2** | Medium-value, architecture improvement | Week 5-10 |
| **P3** | Nice-to-have, differentiation feature | Week 10-16 |

---

## Phase 1: Foundation & Performance (Week 1-3)

### 1.1 Token Estimation Accuracy [P0]

**Current:** `util/token.ts` uses flat `chars / 4` heuristic, ~30-50% error on CJK/code.
**Target:** Per-model adaptive estimation, <10% error.

#### Tasks

- [ ] **1.1.1** Benchmark current `Token.estimate()` accuracy
  - **File:** `packages/opencode/src/util/token.ts`
  - **Action:** Create test corpus (English prose, Chinese text, mixed code, JSON, Markdown) and measure estimation error against real Anthropic/OpenAI token counts
  - **Effort:** 0.5 day
  - **Acceptance:** Baseline error rates documented per content type

- [ ] **1.1.2** Implement content-aware estimation heuristics
  - **File:** `packages/opencode/src/util/token.ts`
  - **Action:** Replace single `CHARS_PER_TOKEN = 4` with content-type-aware ratios:
    - English prose: 4.0 chars/token
    - CJK (Chinese/Japanese/Korean): 1.5 chars/token
    - Code (TypeScript/Python): 3.5 chars/token
    - JSON/structured data: 3.0 chars/token
    - Mixed content: weighted average by character class detection
  - **Effort:** 1 day
  - **Acceptance:** Error rate drops to <15% across all content types

- [ ] **1.1.3** Implement adaptive calibration using Provider response metadata
  - **Files:** `packages/opencode/src/util/token.ts`, `packages/opencode/src/session/index.ts`
  - **Action:** After each LLM call, compare estimated tokens vs actual `usage.inputTokens`. Maintain a per-model rolling average correction factor. Store calibration data in SQLite.
  - **Effort:** 2 days
  - **Acceptance:** After 5 API calls, estimation error converges to <10%

- [ ] **1.1.4** Unit tests for token estimation
  - **Action:** Test all content types, edge cases (empty string, pure emoji, binary-like content, 100KB+ strings)
  - **Effort:** 0.5 day
  - **Acceptance:** 100% branch coverage on `token.ts`

- [ ] **1.1.5** Integration test: overflow detection with calibrated estimator
  - **Files:** `packages/opencode/src/session/overflow.ts`
  - **Action:** Verify `isOverflow()` triggers within correct ±5% window with calibrated estimator
  - **Effort:** 0.5 day
  - **Acceptance:** No false-negative overflow (missed trigger) in test suite

**Benchmark 1.1:**
| Metric | Baseline | Target |
|--------|----------|--------|
| English estimation error | ~5% | <5% |
| Chinese estimation error | ~40% | <10% |
| Code estimation error | ~15% | <10% |
| JSON estimation error | ~25% | <10% |
| Calibration convergence | N/A | <5 calls |

---

### 1.2 Atomic File Operations [P0]

**Current:** `Filesystem.write()` → direct `writeFile()`. Crash = corruption.
**Target:** Atomic write-then-rename for all file mutations.

#### Tasks

- [ ] **1.2.1** Implement `atomicWrite()` in filesystem utility
  - **File:** `packages/opencode/src/util/filesystem.ts`
  - **Action:** Write to `{path}.opencode.tmp` → `fsync` → `rename` to `{path}`. Cleanup `.tmp` on failure.
  - **Effort:** 0.5 day
  - **Acceptance:** File corruption impossible on crash/power loss

- [ ] **1.2.2** Migrate Edit tool to atomic write
  - **File:** `packages/opencode/src/tool/edit.ts`
  - **Action:** Replace `Filesystem.write()` with `atomicWrite()`. Add rollback if `Format.file()` fails (restore from `.bak`).
  - **Effort:** 1 day
  - **Acceptance:** Edit + Format failure leaves file in pre-edit state

- [ ] **1.2.3** Migrate Write tool to atomic write
  - **File:** `packages/opencode/src/tool/write.ts`
  - **Action:** Same atomic pattern. Handle new-file case (no `.bak` needed, just cleanup `.tmp` on failure).
  - **Effort:** 0.5 day
  - **Acceptance:** Write failure leaves no partial file

- [ ] **1.2.4** Fix Edit tool race condition
  - **File:** `packages/opencode/src/tool/edit.ts`
  - **Action:** Move `FileTime.assert()` inside the atomic write transaction. Re-check mtime after acquiring write lock, before rename.
  - **Effort:** 1 day
  - **Acceptance:** Concurrent external modification detected and rejected

- [ ] **1.2.5** Unit tests: atomic write
  - **Action:** Test: normal write, crash simulation (kill mid-write), concurrent write, permission denied, disk full, symlink target
  - **Effort:** 1 day
  - **Acceptance:** All crash scenarios leave file intact

- [ ] **1.2.6** Integration test: Edit + Format failure rollback
  - **Action:** Mock `Format.file()` to throw. Verify file content unchanged.
  - **Effort:** 0.5 day
  - **Acceptance:** Zero data loss in 1000 simulated failures

**Benchmark 1.2:**
| Metric | Baseline | Target |
|--------|----------|--------|
| File corruption on crash | Possible | Impossible |
| Edit rollback on Format failure | No rollback | 100% rollback |
| Write latency overhead | 0ms | <5ms (rename cost) |

---

### 1.3 Tool Initialization Caching [P0]

**Current:** `ToolRegistry.tools()` re-initializes ALL tools on every LLM call. Bash WASM reload ~100ms.
**Target:** Initialize once, cache until agent/model changes.

#### Tasks

- [ ] **1.3.1** Benchmark current tool init overhead
  - **File:** `packages/opencode/src/tool/registry.ts`
  - **Action:** Add timing instrumentation around `tool.init()`. Measure per-tool and total init time.
  - **Effort:** 0.5 day
  - **Acceptance:** Baseline timings documented

- [ ] **1.3.2** Implement tool init result cache
  - **File:** `packages/opencode/src/tool/registry.ts`
  - **Action:** Cache `tool.init()` results keyed by `(tool.id, agent.name)`. Invalidate when agent changes or tool code changes (for custom tools, use file mtime).
  - **Effort:** 1.5 days
  - **Acceptance:** `tool.init()` called exactly once per tool per agent per session

- [ ] **1.3.3** Lazy WASM loading for Bash tool
  - **File:** `packages/opencode/src/tool/bash.ts`
  - **Action:** Move Tree-sitter WASM parser init to first actual `execute()` call, not `init()`. Cache parser singleton.
  - **Effort:** 1 day
  - **Acceptance:** WASM loaded only when bash tool actually used

- [ ] **1.3.4** Unit tests: cache hit/miss/invalidation
  - **Action:** Test: same agent reuses cache, different agent triggers re-init, custom tool file change triggers re-init
  - **Effort:** 0.5 day
  - **Acceptance:** 100% cache behavior verified

- [ ] **1.3.5** Integration test: tool init across multi-step agentic loop
  - **Action:** Run 5-step agent loop, verify init called only in step 1
  - **Effort:** 0.5 day
  - **Acceptance:** Init count = tool_count (not tool_count × step_count)

**Benchmark 1.3:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Tool init time (first call) | ~200ms | ~200ms (no change) |
| Tool init time (subsequent) | ~200ms | <5ms (cache hit) |
| WASM load (unused bash) | ~100ms | 0ms (deferred) |
| Init calls per 10-step loop | ~200 (20 tools × 10) | 20 (one-time) |

---

### 1.4 Instruction Loading Cache [P1]

**Current:** `InstructionPrompt.system()` re-reads filesystem and walks directory tree every turn.
**Target:** Cache with FileWatcher-driven invalidation.

#### Tasks

- [ ] **1.4.1** Benchmark instruction loading cost
  - **File:** `packages/opencode/src/session/instruction.ts`
  - **Action:** Add timing instrumentation. Measure file I/O, directory walk, HTTP fetch times.
  - **Effort:** 0.5 day
  - **Acceptance:** Baseline documented

- [ ] **1.4.2** Implement in-memory instruction cache
  - **File:** `packages/opencode/src/session/instruction.ts`
  - **Action:** Cache resolved instruction content keyed by file path + mtime. TTL = 30s as safety net.
  - **Effort:** 1 day
  - **Acceptance:** File reads reduced to 1 per file per 30s maximum

- [ ] **1.4.3** Integrate with FileWatcher for instant invalidation
  - **Files:** `packages/opencode/src/session/instruction.ts`, `packages/opencode/src/file/watcher.ts`
  - **Action:** Subscribe to FileWatcher events for CLAUDE.md/AGENTS.md paths. Invalidate cache on `change` event.
  - **Effort:** 1 day
  - **Acceptance:** Editing CLAUDE.md reflects in next LLM call within 500ms

- [ ] **1.4.4** Cache HTTP-based instructions with ETag/Last-Modified
  - **Action:** For URL-based instructions, use conditional HTTP requests (If-None-Match / If-Modified-Since).
  - **Effort:** 0.5 day
  - **Acceptance:** No unnecessary HTTP fetches for unchanged content

- [ ] **1.4.5** Unit tests: cache lifecycle
  - **Action:** Test: cold start, warm hit, file change invalidation, TTL expiry, HTTP 304 handling
  - **Effort:** 0.5 day
  - **Acceptance:** All cache states verified

**Benchmark 1.4:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Instruction load time (cold) | ~50-200ms | ~50-200ms (no change) |
| Instruction load time (warm) | ~50-200ms | <1ms (cache hit) |
| File reads per 10-turn session | ~30-60 | ~3-6 (initial + changes) |
| HTTP fetches per session | N × turns | 1 + conditional |

---

## Phase 2: Intelligence & Context (Week 4-7)

### 2.1 Cross-Session Memory System [P1]

**Current:** No cross-session knowledge. Each session starts from zero.
**Target:** Persistent, project-scoped semantic memory with auto-extraction and injection.

#### Tasks

- [ ] **2.1.1** Design memory schema
  - **Action:** Create `MemoryTable` in SQLite:
    ```sql
    CREATE TABLE memory (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
      type TEXT NOT NULL,          -- 'fact' | 'preference' | 'pitfall' | 'architecture' | 'pattern'
      content TEXT NOT NULL,
      source_session TEXT,         -- session_id that produced this memory
      source_message TEXT,         -- message_id that produced this memory
      confidence REAL DEFAULT 1.0, -- 0.0-1.0, decays over time
      tags TEXT,                   -- JSON array of keywords for FTS
      time_created INTEGER NOT NULL,
      time_accessed INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      access_count INTEGER DEFAULT 0
    );
    CREATE INDEX memory_project_idx ON memory(project_id);
    CREATE INDEX memory_type_idx ON memory(project_id, type);
    ```
  - **Effort:** 1 day
  - **Acceptance:** Schema reviewed and migration created

- [ ] **2.1.2** Implement FTS5 index for semantic keyword search
  - **Action:** Create FTS5 virtual table:
    ```sql
    CREATE VIRTUAL TABLE memory_fts USING fts5(
      content, tags,
      content=memory, content_rowid=rowid
    );
    ```
    Sync on insert/update/delete via triggers.
  - **Effort:** 1 day
  - **Acceptance:** FTS search returns relevant memories in <10ms

- [ ] **2.1.3** Implement memory extraction from Compaction summaries
  - **Files:** `packages/opencode/src/session/compaction.ts`, new `packages/opencode/src/memory/index.ts`
  - **Action:** After compaction agent generates summary, parse structured fields (Discoveries, Accomplished, Relevant Files) and create memory entries.
  - **Effort:** 2 days
  - **Acceptance:** Each compaction generates 3-10 memory entries automatically

- [ ] **2.1.4** Implement memory extraction from session completion
  - **File:** `packages/opencode/src/memory/index.ts`
  - **Action:** When session ends (or goes idle for >5min), run lightweight extraction:
    - Diff summary → "Changed files: ..." fact
    - Compaction discoveries → pitfall/architecture entries
    - User corrections → preference entries
  - **Effort:** 2 days
  - **Acceptance:** Session completion produces 1-5 memory entries

- [ ] **2.1.5** Implement memory injection into system prompt
  - **File:** `packages/opencode/src/session/prompt.ts`
  - **Action:** At session start, query `SELECT * FROM memory WHERE project_id = ? ORDER BY confidence * access_count DESC LIMIT 20`. Format as `<project-memory>` block and inject into system prompt.
  - **Effort:** 1.5 days
  - **Acceptance:** New session system prompt contains relevant memories from previous sessions

- [ ] **2.1.6** Implement memory relevance scoring
  - **File:** `packages/opencode/src/memory/index.ts`
  - **Action:** Score = `confidence × recency_weight × access_frequency_weight`. Confidence decays 5%/week for unaccessed memories. Access bumps score.
  - **Effort:** 1 day
  - **Acceptance:** Old unused memories naturally fade; frequently-accessed ones persist

- [ ] **2.1.7** Implement memory CRUD tool for user control
  - **File:** new `packages/opencode/src/tool/memory.ts`
  - **Action:** Agent tool to: list memories, add memory, update memory, delete memory. User can also say "remember this" / "forget that".
  - **Effort:** 1.5 days
  - **Acceptance:** User can manually manage memories via natural language

- [ ] **2.1.8** Implement memory deduplication
  - **File:** `packages/opencode/src/memory/index.ts`
  - **Action:** Before inserting, FTS search for similar existing memories. If similarity > 80% (Jaccard on keywords), update existing instead of creating duplicate. Merge confidence scores.
  - **Effort:** 1 day
  - **Acceptance:** No semantically duplicate memories in database

- [ ] **2.1.9** Unit tests: memory CRUD
  - **Action:** Test: create, read, update, delete, search, deduplication, confidence decay, access counting
  - **Effort:** 1 day
  - **Acceptance:** 100% branch coverage on memory module

- [ ] **2.1.10** Integration test: cross-session memory flow
  - **Action:** Session A discovers "project uses Hono framework" → Session B's system prompt includes this fact
  - **Effort:** 1 day
  - **Acceptance:** End-to-end memory flow verified across 3 sessions

- [ ] **2.1.11** E2E test: memory relevance and decay
  - **Action:** Create 100 memories, advance time 4 weeks, verify stale memories drop below threshold
  - **Effort:** 0.5 day
  - **Acceptance:** Decay curve matches specification

**Benchmark 2.1:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Cross-session knowledge transfer | 0% | >80% of key facts |
| Memory query latency | N/A | <10ms for 1000 entries |
| Duplicate detection accuracy | N/A | >90% |
| Memory injection token overhead | 0 | <500 tokens (top-20) |
| Relevant memory precision | N/A | >70% (human eval) |

---

### 2.2 Intelligent Agent Routing [P1]

**Current:** Manual `@agent` selection. Most users use default build agent for everything.
**Target:** Auto-select optimal agent based on task classification.

#### Tasks

- [ ] **2.2.1** Design intent classification taxonomy
  - **Action:** Define task categories:
    - `explore`: questions about codebase, "what does X do", "find Y"
    - `plan`: architecture questions, "how should I", "design a"
    - `build`: "fix", "add", "change", "implement", "refactor"
    - `debug`: "error", "bug", "failing", "not working"
    - `test`: "test", "coverage", "spec"
  - **Effort:** 0.5 day
  - **Acceptance:** Taxonomy covers >95% of real user prompts

- [ ] **2.2.2** Implement keyword-based intent classifier
  - **File:** new `packages/opencode/src/agent/router.ts`
  - **Action:** Rule-based classifier using keyword patterns + prompt structure analysis. No LLM call needed.
    ```typescript
    function classifyIntent(prompt: string): AgentType {
      // Priority-ordered rules
      if (/what|where|how does|find|show|explain|list/i.test(prompt)) return "explore"
      if (/plan|design|architect|approach|strategy/i.test(prompt)) return "plan"
      if (/fix|bug|error|broken|fail|debug|wrong/i.test(prompt)) return "build" // debug uses build with context
      return "build" // default
    }
    ```
  - **Effort:** 1 day
  - **Acceptance:** Classification accuracy >85% on test corpus

- [ ] **2.2.3** Integrate router into session prompt loop
  - **File:** `packages/opencode/src/session/prompt.ts`
  - **Action:** Before agent resolution, run classifier. If result differs from default and user hasn't explicitly specified agent, use classified agent. Show brief notification: "Using explore agent for this query".
  - **Effort:** 1 day
  - **Acceptance:** Appropriate agent auto-selected for test scenarios

- [ ] **2.2.4** User override and feedback mechanism
  - **Action:** User can prefix `@build` to override auto-routing. If user overrides, log as negative signal for classifier tuning.
  - **Effort:** 0.5 day
  - **Acceptance:** Manual override always takes precedence

- [ ] **2.2.5** Unit tests: intent classification
  - **Action:** Test corpus of 200 real prompts with labeled intents. Measure precision/recall per category.
  - **Effort:** 1 day
  - **Acceptance:** >85% accuracy, >80% per-category recall

- [ ] **2.2.6** Integration test: auto-routing end-to-end
  - **Action:** Submit exploratory question → verify explore agent used → verify no edit tools available → verify response quality
  - **Effort:** 1 day
  - **Acceptance:** Correct agent selected in 9/10 test scenarios

**Benchmark 2.2:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Intent classification accuracy | N/A (manual) | >85% |
| Explore tasks using explore agent | ~5% (manual) | >70% (auto) |
| Cost reduction for read-only tasks | 0% | ~30% (cheaper model for explore) |
| User override rate | N/A | <15% (good auto-routing) |
| Classification latency | N/A | <1ms (rule-based) |

---

### 2.3 Structured Subtask Results [P1]

**Current:** `task.ts` returns only last text part. All tool calls, reasoning, and findings lost.
**Target:** Structured result extraction with findings, files, and decisions.

#### Tasks

- [ ] **2.3.1** Define SubtaskResult schema
  - **File:** new type in `packages/opencode/src/tool/task.ts`
  - **Action:**
    ```typescript
    interface SubtaskResult {
      summary: string
      findings: string[]
      files_read: string[]
      files_modified: string[]
      decisions: string[]
      errors: string[]
      raw_text: string
    }
    ```
  - **Effort:** 0.5 day
  - **Acceptance:** Schema reviewed

- [ ] **2.3.2** Implement result extraction from subtask messages
  - **File:** `packages/opencode/src/tool/task.ts`
  - **Action:** After subtask completes, iterate all messages/parts:
    - ToolPart(read) → add to `files_read`
    - ToolPart(edit/write) → add to `files_modified`
    - ToolPart(error) → add to `errors`
    - TextPart → extract via template into `summary`/`findings`
  - **Effort:** 2 days
  - **Acceptance:** Structured result captures >90% of actionable information

- [ ] **2.3.3** Format structured result for parent agent
  - **Action:** Return structured XML/Markdown to parent:
    ```xml
    <task_result>
      <summary>...</summary>
      <findings>
        <finding>Project uses Hono v4.10 for HTTP</finding>
        ...
      </findings>
      <files_read>src/server/server.ts, src/bus/index.ts</files_read>
      <files_modified>none</files_modified>
    </task_result>
    ```
  - **Effort:** 1 day
  - **Acceptance:** Parent agent correctly interprets structured results

- [ ] **2.3.4** Feed subtask results into memory system (if 2.1 done)
  - **Action:** Key findings from subtasks auto-extracted as memory entries
  - **Effort:** 0.5 day
  - **Acceptance:** Subtask discoveries persist across sessions

- [ ] **2.3.5** Unit tests: result extraction
  - **Action:** Test with mock subtask messages containing various tool types and text patterns
  - **Effort:** 1 day
  - **Acceptance:** Extraction correct for 10 diverse subtask scenarios

- [ ] **2.3.6** Integration test: parent-child context transfer
  - **Action:** Parent delegates "explore auth module", child returns structured findings, parent uses findings to plan edits
  - **Effort:** 1 day
  - **Acceptance:** Parent agent references child's specific findings in its plan

**Benchmark 2.3:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Information preservation | ~20% (last text only) | >90% (structured) |
| Files tracked from subtask | 0 | 100% |
| Parent agent context quality | Poor | Actionable structured data |

---

### 2.4 Enhanced Prompt Cache Strategy [P2]

**Current:** 4 cache points (2 system + 2 last messages). Misses compaction summaries.
**Target:** Adaptive cache point placement maximizing hit rate.

#### Tasks

- [ ] **2.4.1** Benchmark current cache hit rate
  - **File:** `packages/opencode/src/provider/transform.ts`
  - **Action:** Log `cache.read` vs `cache.write` per request. Calculate hit rate across multi-step sessions.
  - **Effort:** 0.5 day
  - **Acceptance:** Baseline documented

- [ ] **2.4.2** Add compaction summary to cache points
  - **File:** `packages/opencode/src/provider/transform.ts`
  - **Action:** In `applyCaching()`, detect assistant messages with `summary: true` flag. Mark as cacheable (stable content, never changes after creation).
  - **Effort:** 1 day
  - **Acceptance:** Compaction summaries cached on second access

- [ ] **2.4.3** Implement adaptive cache point selection
  - **Action:** Instead of fixed "first 2 + last 2", score each message by stability:
    - System prompts: stability = 1.0 (always cache)
    - Compaction summaries: stability = 1.0
    - User messages older than 2 turns: stability = 0.9
    - Recent messages: stability = 0.5
    Select top-4 by stability × token_count (prioritize caching large stable content).
  - **Effort:** 2 days
  - **Acceptance:** Cache hit rate improves by >15%

- [ ] **2.4.4** Provider-specific cache point limits
  - **Action:** Anthropic supports 4 breakpoints. Others may differ. Make limit configurable per provider.
  - **Effort:** 0.5 day
  - **Acceptance:** No provider rejects requests due to excess cache points

- [ ] **2.4.5** Unit tests: cache point placement
  - **Action:** Test various message sequences, verify optimal placement
  - **Effort:** 0.5 day
  - **Acceptance:** Cache points match expected positions in all test cases

- [ ] **2.4.6** Integration test: cache savings measurement
  - **Action:** Run 10-step session, compare cost with baseline vs optimized cache
  - **Effort:** 1 day
  - **Acceptance:** Measurable cost reduction in test scenario

**Benchmark 2.4:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Cache hit rate (10-step session) | ~60% | >80% |
| Tokens cached per session | ~3500 | ~6000+ (incl. summaries) |
| Cost per 10-step session | $X | <0.85X (>15% reduction) |
| Cache miss on compaction summary | 100% | 0% after first access |

---

## Phase 3: Advanced Capabilities (Week 8-12)

### 3.1 Lightweight RAG with SQLite FTS5 [P2]

**Current:** Code discovery relies entirely on Glob (filename) + Grep (regex). No semantic understanding.
**Target:** FTS5-based code index for semantic-adjacent search.

#### Tasks

- [ ] **3.1.1** Design code index schema
  - **Action:**
    ```sql
    CREATE TABLE code_index (
      id INTEGER PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      symbols TEXT,         -- extracted function/class/variable names
      imports TEXT,         -- import statements
      summary TEXT,         -- first 10 lines + comment blocks
      last_indexed INTEGER, -- mtime when indexed
      UNIQUE(project_id, file_path)
    );
    CREATE VIRTUAL TABLE code_fts USING fts5(
      file_path, symbols, imports, summary,
      content=code_index, content_rowid=id
    );
    ```
  - **Effort:** 1 day
  - **Acceptance:** Schema supports efficient FTS queries

- [ ] **3.1.2** Implement initial indexing on project open
  - **File:** new `packages/opencode/src/index/index.ts`
  - **Action:** On `Instance.init()`, scan project files via ripgrep. For each file: extract symbols (regex or tree-sitter), extract imports, take first 10 lines as summary. Insert into `code_index`.
  - **Effort:** 3 days
  - **Acceptance:** 10K-file project indexed in <30s

- [ ] **3.1.3** Implement incremental index update via FileWatcher
  - **Action:** On file change event, re-index only changed file. On file delete, remove entry.
  - **Effort:** 1.5 days
  - **Acceptance:** Index stays current within 1s of file change

- [ ] **3.1.4** Implement FTS search tool for agents
  - **File:** new `packages/opencode/src/tool/codefind.ts`
  - **Action:** New tool `codefind` that queries FTS5 index. Returns ranked file paths + snippets.
  - **Effort:** 1.5 days
  - **Acceptance:** Query "authentication middleware" finds relevant files even without exact keyword match

- [ ] **3.1.5** Integrate FTS results into Glob/Grep fallback
  - **Action:** When Glob returns 0 results and Grep returns 0 results, automatically try FTS search. Present as "Did you mean..." suggestions.
  - **Effort:** 1 day
  - **Acceptance:** Zero-result searches now surface FTS suggestions

- [ ] **3.1.6** Unit tests: indexing and search
  - **Action:** Test: index creation, incremental update, FTS query ranking, file deletion cleanup
  - **Effort:** 1 day
  - **Acceptance:** 100% coverage on index module

- [ ] **3.1.7** Integration test: FTS vs Grep comparison
  - **Action:** 20 real search queries, compare FTS results vs Grep results. Measure recall improvement.
  - **Effort:** 1 day
  - **Acceptance:** FTS finds relevant files missed by Grep in >30% of semantic queries

**Benchmark 3.1:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Index build time (10K files) | N/A | <30s |
| Incremental update time | N/A | <100ms per file |
| FTS query time | N/A | <10ms |
| Semantic search recall | ~60% (grep only) | >85% (grep + FTS) |
| Index storage size (10K files) | N/A | <50MB |

---

### 3.2 Multi-Agent Pipeline [P2]

**Current:** Subtasks are independent, fire-and-forget. No inter-task data flow.
**Target:** Sequential/parallel pipeline with explicit data flow between stages.

#### Tasks

- [ ] **3.2.1** Design pipeline execution model
  - **Action:** Define pipeline as DAG (Directed Acyclic Graph):
    ```typescript
    interface Pipeline {
      stages: PipelineStage[]
    }
    interface PipelineStage {
      id: string
      agent: AgentType
      prompt: string
      dependsOn: string[]       // stage IDs that must complete first
      inputMapping: Record<string, string>  // map dependency outputs to this stage's context
    }
    ```
  - **Effort:** 1 day
  - **Acceptance:** Design supports both sequential and parallel execution patterns

- [ ] **3.2.2** Implement pipeline executor
  - **File:** new `packages/opencode/src/agent/pipeline.ts`
  - **Action:** Execute stages respecting dependency order. Parallel execution for independent stages. Inject predecessor outputs into successor's prompt context.
  - **Effort:** 3 days
  - **Acceptance:** 3-stage sequential pipeline executes correctly

- [ ] **3.2.3** Implement pipeline result aggregation
  - **Action:** Collect all stage results into unified pipeline result. Include per-stage summary, timing, files touched, and errors.
  - **Effort:** 1 day
  - **Acceptance:** Parent agent receives comprehensive pipeline report

- [ ] **3.2.4** Implement pipeline tool for agents
  - **File:** new `packages/opencode/src/tool/pipeline.ts`
  - **Action:** Tool that creates and executes pipelines. Agent can define stages dynamically.
  - **Effort:** 2 days
  - **Acceptance:** Agent can orchestrate multi-stage workflows

- [ ] **3.2.5** Unit tests: pipeline execution
  - **Action:** Test: sequential 3-stage, parallel 2-stage, diamond dependency, stage failure handling, timeout
  - **Effort:** 1.5 days
  - **Acceptance:** All DAG patterns execute correctly

- [ ] **3.2.6** Integration test: explore → plan → build pipeline
  - **Action:** "Refactor auth module" triggers: explore → plan → build. Verify data flows between stages.
  - **Effort:** 1.5 days
  - **Acceptance:** Each stage uses predecessor's output correctly

**Benchmark 3.2:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Multi-step task completion rate | ~70% (single agent) | >85% (pipeline) |
| Context transfer between stages | 0% | >90% of key findings |
| Parallel stage speedup | N/A | ~1.5-2x for independent stages |

---

### 3.3 Adaptive Tool Descriptions [P2]

**Current:** All 20+ tool descriptions sent every request (~3000-5000 tokens).
**Target:** Phase-aware tool description compression.

#### Tasks

- [ ] **3.3.1** Measure current tool description token cost
  - **Action:** Count tokens in all `.txt` description files combined
  - **Effort:** 0.5 day
  - **Acceptance:** Baseline documented

- [ ] **3.3.2** Create compact tool descriptions (one-liner per tool)
  - **File:** New `.compact.txt` alongside each `.txt` in `packages/opencode/src/tool/`
  - **Action:** Each tool gets a 1-sentence compact description for non-primary phases
  - **Effort:** 1 day
  - **Acceptance:** Compact descriptions total <500 tokens

- [ ] **3.3.3** Implement phase detection
  - **File:** new `packages/opencode/src/tool/adaptive.ts`
  - **Action:** Detect conversation phase from recent tool usage:
    - No tools used yet → "exploration" phase (full Glob/Grep/Read descriptions)
    - Read tools used → "understanding" phase (full Edit/Write descriptions)
    - Edit tools used → "modification" phase (full Bash/LSP descriptions)
  - **Effort:** 1.5 days
  - **Acceptance:** Phase detection matches human-labeled ground truth >80%

- [ ] **3.3.4** Integrate adaptive descriptions into tool resolution
  - **File:** `packages/opencode/src/session/llm.ts`
  - **Action:** Pass phase to `ToolRegistry.tools()`. Return full descriptions for phase-relevant tools, compact for others.
  - **Effort:** 1 day
  - **Acceptance:** Token savings without functionality loss

- [ ] **3.3.5** Unit tests: phase detection
  - **Action:** Test various tool usage sequences, verify correct phase identification
  - **Effort:** 0.5 day
  - **Acceptance:** Phase detection correct in 10 test scenarios

- [ ] **3.3.6** Integration test: description switching doesn't break tool usage
  - **Action:** Run full agent loop, verify tools still callable with compact descriptions
  - **Effort:** 1 day
  - **Acceptance:** Zero tool call failures due to description changes

**Benchmark 3.3:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Tool description tokens per request | ~4000 | ~1500-2000 (phase-adaptive) |
| Token savings per 10-step session | 0 | ~20,000-30,000 tokens |
| Tool call accuracy | >95% | >95% (no regression) |

---

### 3.4 Compaction Quality Improvement [P2]

**Current:** Compaction is all-or-nothing. No incremental stages. Failure = session stops.
**Target:** Multi-stage compaction with graceful degradation.

#### Tasks

- [ ] **3.4.1** Implement incremental compaction levels
  - **File:** `packages/opencode/src/session/compaction.ts`
  - **Action:** Three compaction levels:
    - Level 1: Prune old tool outputs (existing)
    - Level 2: Compress tool outputs to summaries (new - keep tool name + 1-line result)
    - Level 3: Full compaction via sub-LLM (existing)
  - **Effort:** 2 days
  - **Acceptance:** Level 2 reduces tokens by 40-60% without sub-LLM call

- [ ] **3.4.2** Implement compaction failure recovery
  - **Action:** If Level 3 (sub-LLM) fails:
    1. Retry once with smaller context (truncate older messages first)
    2. If retry fails, fall back to Level 2 aggressive truncation
    3. If still over limit, offer user "start new session with summary" option
  - **Effort:** 1.5 days
  - **Acceptance:** No session terminates with unrecoverable ContextOverflowError

- [ ] **3.4.3** Implement pre-emptive compaction trigger
  - **File:** `packages/opencode/src/session/overflow.ts`
  - **Action:** Trigger Level 1-2 at 70% context usage (not 95%+ as current). Reserve full compaction for >85%.
  - **Effort:** 1 day
  - **Acceptance:** Compaction happens gradually, not as emergency measure

- [ ] **3.4.4** Unit tests: compaction levels
  - **Action:** Test each level independently and in sequence
  - **Effort:** 1 day
  - **Acceptance:** Each level produces expected token reduction

- [ ] **3.4.5** Integration test: compaction under load
  - **Action:** Generate session with 200K tokens of context. Verify compaction levels kick in at correct thresholds and session continues.
  - **Effort:** 1 day
  - **Acceptance:** Session survives 200K+ total context without stopping

**Benchmark 3.4:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Compaction failure rate | ~5% (estimate) | <0.5% |
| Level 2 token reduction | N/A | 40-60% |
| Session survival at 200K+ | ~90% | >99% |
| Compaction overhead (Level 2) | N/A | <50ms (no LLM) |

---

## Phase 4: Polish & Hardening (Week 13-16)

### 4.1 Security Hardening [P1]

#### Tasks

- [ ] **4.1.1** Symlink validation for all file operations
  - **Files:** `packages/opencode/src/permission/`, `packages/opencode/src/util/filesystem.ts`
  - **Action:** Before any file operation, resolve symlinks and validate the real path matches allowed patterns. Reject symlinks pointing outside project root.
  - **Effort:** 1 day
  - **Acceptance:** Symlink-based directory traversal impossible

- [ ] **4.1.2** Bash subprocess tree cleanup
  - **File:** `packages/opencode/src/tool/bash.ts`
  - **Action:** Use process group kill (`kill(-pgid, SIGTERM)`) with escalation to SIGKILL after 5s. Track all spawned PIDs.
  - **Effort:** 1.5 days
  - **Acceptance:** Zero orphaned processes after bash tool timeout

- [ ] **4.1.3** Permission isolation per session
  - **File:** `packages/opencode/src/permission/index.ts`
  - **Action:** "Always allow" permissions scoped to session, not global. Cross-session permissions require re-approval or explicit config.
  - **Effort:** 1.5 days
  - **Acceptance:** Session A's permissions don't leak to Session B

- [ ] **4.1.4** External formatter sandboxing
  - **Action:** When `Format.file()` executes external formatters (prettier, eslint), run in restricted subprocess with limited file access.
  - **Effort:** 2 days
  - **Acceptance:** Malicious formatter can't read/write outside project

- [ ] **4.1.5** Security test suite
  - **Action:** Tests for: symlink traversal, command injection, permission escalation, process orphaning, path traversal via `../`
  - **Effort:** 2 days
  - **Acceptance:** All OWASP-relevant attack vectors covered

**Benchmark 4.1:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Symlink traversal | Possible | Blocked |
| Orphaned processes after timeout | Possible | Zero |
| Cross-session permission leak | Possible | Isolated |
| Command injection vectors | Medium risk | All mitigated |

---

### 4.2 Error Recovery & Resilience [P2]

#### Tasks

- [ ] **4.2.1** Edit tool transactional rollback
  - **Action:** If any step (write/format/verify) fails, restore original file from backup. Log the failure with full context.
  - **Effort:** 1 day
  - **Acceptance:** No partial edits possible

- [ ] **4.2.2** LSP circuit breaker
  - **File:** `packages/opencode/src/lsp/client.ts`
  - **Action:** If LSP server fails 3 consecutive requests within 30s, mark as "circuit open". Skip LSP calls for 60s before retrying. Auto-restart server after 3 circuit trips.
  - **Effort:** 1.5 days
  - **Acceptance:** Unresponsive LSP doesn't block tool execution

- [ ] **4.2.3** WebSearch/CodeSearch response body timeout
  - **Files:** `packages/opencode/src/tool/websearch.ts`, `packages/opencode/src/tool/codesearch.ts`
  - **Action:** Apply timeout to `response.text()`, not just `fetch()`. Abort if response body takes >10s.
  - **Effort:** 0.5 day
  - **Acceptance:** No indefinite hang on large response bodies

- [ ] **4.2.4** Retry-after header validation
  - **File:** `packages/opencode/src/session/retry.ts`
  - **Action:** Cap `retry-after` to maximum 300 seconds. Reject non-numeric or negative values.
  - **Effort:** 0.5 day
  - **Acceptance:** Malicious retry-after can't cause excessive delay

- [ ] **4.2.5** Resilience test suite
  - **Action:** Tests for: LSP crash recovery, network timeout, disk full, concurrent edits, provider rate limiting, abort during tool execution
  - **Effort:** 2 days
  - **Acceptance:** System recovers gracefully from all simulated failures

**Benchmark 4.2:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Edit failure leaves corrupt file | Yes | No |
| LSP hang blocks agent | Yes | No (circuit breaker) |
| Provider timeout recovery | Manual | Automatic with backoff |

---

### 4.3 Performance Optimization [P2]

#### Tasks

- [ ] **4.3.1** Message hydration batch optimization
  - **File:** `packages/opencode/src/session/message-v2.ts`
  - **Action:** Current `hydrate()` loads all parts for all messages in one query (good), but parses JSON for every part (expensive). Add lazy deserialization: parse part data only when accessed.
  - **Effort:** 1.5 days
  - **Acceptance:** Hydration time reduced by >30% for sessions with 100+ parts

- [ ] **4.3.2** Ripgrep streaming output for large file lists
  - **File:** `packages/opencode/src/file/ripgrep.ts`
  - **Action:** Replace string buffer accumulation with line-by-line `yield` for the `files()` generator. Avoid O(n) string concatenation.
  - **Effort:** 1 day
  - **Acceptance:** Memory usage flat regardless of file count

- [ ] **4.3.3** Database query plan optimization
  - **Action:** Run `EXPLAIN QUERY PLAN` on all hot-path queries. Add missing indexes if needed.
  - **Effort:** 1 day
  - **Acceptance:** No full table scans on hot paths

- [ ] **4.3.4** Performance regression test suite
  - **Action:** Automated benchmarks for: tool init time, message hydration time, FTS query time, cache hit rate
  - **Effort:** 1.5 days
  - **Acceptance:** CI catches >10% performance regressions

**Benchmark 4.3:**
| Metric | Baseline | Target |
|--------|----------|--------|
| Message hydration (100 parts) | ~50ms | <35ms |
| Ripgrep 10K files memory | ~10MB | <2MB |
| SQLite query plans | Unchecked | All indexed |

---

### 4.4 Observability & Metrics [P3]

#### Tasks

- [ ] **4.4.1** Token usage dashboard data export
  - **Action:** Export per-session: total tokens, cache hits, cache misses, cost breakdown, compaction count
  - **Effort:** 1 day
  - **Acceptance:** Data available in JSON format for external dashboards

- [ ] **4.4.2** Memory system health metrics
  - **Action:** Track: memory count, query hit rate, decay rate, deduplication rate
  - **Effort:** 0.5 day
  - **Acceptance:** Health metrics queryable via CLI command

- [ ] **4.4.3** Agent routing effectiveness tracking
  - **Action:** Log: auto-routed agent, user override count, task completion rate per agent
  - **Effort:** 0.5 day
  - **Acceptance:** Routing effectiveness measurable

- [ ] **4.4.4** Structured logging for all optimization features
  - **Action:** Add timing and outcome logs for: token estimation, cache hits, memory queries, compaction, tool init
  - **Effort:** 1 day
  - **Acceptance:** All new features observable in debug logs

---

## Benchmark Suite

### Design Principles

All benchmarks follow:
1. **Repeatable:** Fixed seed data, deterministic where possible
2. **Comparable:** Same test across baseline and optimized versions
3. **Automated:** Run via single command, produce structured report
4. **CI-integrated:** Fail build on regression beyond threshold

### Benchmark Runner

- [ ] **B.1** Create benchmark harness
  - **File:** new `packages/opencode/test/benchmark/runner.ts`
  - **Action:** Framework that runs scenarios, collects metrics, compares against baselines, outputs report
  - **Effort:** 2 days

- [ ] **B.2** Token estimation benchmark
  - **Input:** 5 corpora × 100 samples each (English, Chinese, Code, JSON, Mixed)
  - **Metric:** Mean Absolute Percentage Error vs real tokenizer
  - **Threshold:** MAPE < 10%

- [ ] **B.3** Tool initialization benchmark
  - **Input:** Full tool suite × 10 sequential calls
  - **Metric:** Median init time on calls 2-10
  - **Threshold:** < 5ms (cache hit)

- [ ] **B.4** Cache efficiency benchmark
  - **Input:** 10-step agentic session simulation
  - **Metric:** Cache hit rate, cost savings percentage
  - **Threshold:** Hit rate > 75%, savings > 20%

- [ ] **B.5** Memory system benchmark
  - **Input:** 1000 memories, 50 queries with ground-truth relevance labels
  - **Metric:** Precision@10, query latency P99
  - **Threshold:** Precision > 70%, P99 < 20ms

- [ ] **B.6** FTS index benchmark
  - **Input:** 10K-file project, 50 semantic search queries
  - **Metric:** Build time, query time, recall vs grep baseline
  - **Threshold:** Build < 30s, query < 10ms, recall improvement > 20%

- [ ] **B.7** Compaction effectiveness benchmark
  - **Input:** Sessions at 50%, 70%, 85%, 95% context capacity
  - **Metric:** Token reduction per level, information preservation (human eval)
  - **Threshold:** Level 2 reduces 40%+, zero critical info loss

- [ ] **B.8** End-to-end cost benchmark
  - **Input:** 5 representative coding tasks (explore, fix bug, add feature, refactor, write tests)
  - **Metric:** Total tokens, total cost, completion rate, time to completion
  - **Threshold:** Cost < 85% of baseline, completion rate >= baseline

---

## Testing Strategy

### Test Pyramid

```
         /\
        /  \        E2E Tests (5-10)
       / E2E\       Full session simulations with real LLM
      /______\
     /        \     Integration Tests (30-50)
    / Integr.  \    Multi-module interactions, DB, filesystem
   /____________\
  /              \  Unit Tests (100-200)
 /    Unit        \ Individual functions, edge cases, mocks
/__________________ \
```

### Test Categories

| Category | Count | Tools | CI Time Target |
|----------|-------|-------|---------------|
| Unit - Token estimation | ~20 | vitest | <5s |
| Unit - Memory CRUD | ~25 | vitest + SQLite | <10s |
| Unit - Agent routing | ~30 | vitest | <5s |
| Unit - Atomic write | ~15 | vitest + fs mock | <5s |
| Unit - Tool cache | ~15 | vitest | <5s |
| Unit - Compaction levels | ~20 | vitest | <10s |
| Unit - FTS indexing | ~20 | vitest + SQLite | <10s |
| Integration - Cross-session memory | ~10 | vitest + real DB | <30s |
| Integration - Cache strategy | ~10 | vitest + mock provider | <20s |
| Integration - Pipeline execution | ~10 | vitest + mock agents | <30s |
| Integration - Security | ~15 | vitest + filesystem | <20s |
| Integration - Error recovery | ~15 | vitest + fault injection | <30s |
| E2E - Full session with memory | ~3 | real LLM (mocked cost) | <120s |
| E2E - Compaction under load | ~2 | real session simulation | <60s |
| E2E - Pipeline orchestration | ~2 | real multi-agent flow | <120s |
| Benchmark - All suites | 8 | benchmark runner | <300s |

### Test Infrastructure

- [ ] **T.1** Setup vitest for packages/opencode with coverage reporting
- [ ] **T.2** Create test fixtures: sample projects, mock providers, test corpora
- [ ] **T.3** Create fault injection utilities (crash simulation, network failure, timeout)
- [ ] **T.4** CI pipeline: run unit + integration on every PR, benchmarks weekly

---

## Risk Register

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Token estimation calibration diverges on rare content | Wrong compaction timing | Low | Fallback to chars/4 if calibration variance > 30% |
| Memory system grows unbounded | Slow queries, disk usage | Medium | Enforce max 10K memories/project, auto-prune low-confidence |
| Agent routing misclassifies | Wrong agent, poor results | Medium | Always allow user override, log misclassifications for tuning |
| FTS index corrupts on concurrent writes | Search returns stale results | Low | WAL mode + periodic integrity check |
| Pipeline deadlock on circular deps | Session hangs | Low | DAG validation before execution, cycle detection |
| Atomic write .tmp files accumulate | Disk waste | Low | Cleanup orphaned .tmp files older than 1 hour on startup |
| Cache strategy change breaks provider | API rejection | Medium | Provider-specific cache limit configs, graceful fallback |

---

## Progress Summary

| Phase | Tasks | Completed | Blocked | Progress |
|-------|-------|-----------|---------|----------|
| Phase 1: Foundation | 20 | 0 | 0 | 0% |
| Phase 2: Intelligence | 28 | 0 | 0 | 0% |
| Phase 3: Advanced | 26 | 0 | 0 | 0% |
| Phase 4: Hardening | 19 | 0 | 0 | 0% |
| Benchmark Suite | 9 | 0 | 0 | 0% |
| Test Infrastructure | 4 | 0 | 0 | 0% |
| **Total** | **106** | **0** | **0** | **0%** |

---

> **Next step:** Start with Phase 1, Task 1.1.1 (benchmark current token estimation accuracy). All subsequent tasks build on this foundation.
