import { Schema } from "effect"
import z from "zod"

import { Identifier } from "@/id/id"
import { withStatics } from "@/util/schema"

export const MemoryID = Schema.String.pipe(
  Schema.brand("MemoryID"),
  withStatics((s) => ({
    make: (id: string) => s.makeUnsafe(id),
    ascending: (id?: string) => s.makeUnsafe(Identifier.ascending("memory", id)),
    zod: Identifier.schema("memory").pipe(z.custom<Schema.Schema.Type<typeof s>>()),
  })),
)

export type MemoryID = Schema.Schema.Type<typeof MemoryID>

export const MemoryType = z.enum([
  "architecture",
  "pattern",
  "preference",
  "discovery",
  "correction",
  "file_knowledge",
  "decision",
  "general",
])
export type MemoryType = z.infer<typeof MemoryType>
