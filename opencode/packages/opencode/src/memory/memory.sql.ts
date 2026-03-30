import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/project.sql"
import { Timestamps } from "../storage/schema.sql"
import type { ProjectID } from "../project/schema"
import type { MemoryID, MemoryType } from "./schema"
import type { SessionID } from "../session/schema"

export const MemoryTable = sqliteTable(
  "memory",
  {
    id: text().$type<MemoryID>().primaryKey(),
    project_id: text()
      .$type<ProjectID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    type: text().$type<MemoryType>().notNull(),
    content: text().notNull(),
    tags: text({ mode: "json" }).notNull().$type<string[]>(),
    source_session: text().$type<SessionID>(),
    confidence: integer().notNull().default(100), // 0-100, stored as int to avoid float issues
    access_count: integer().notNull().default(0),
    ...Timestamps,
    time_accessed: integer(),
  },
  (table) => [
    index("memory_project_idx").on(table.project_id),
    index("memory_type_idx").on(table.project_id, table.type),
    index("memory_confidence_idx").on(table.project_id, table.confidence),
  ],
)
