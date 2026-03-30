import { Tool } from "./tool"
import DESCRIPTION from "./memory.txt"
import z from "zod"
import { Memory } from "../memory"
import { MemoryType } from "../memory/schema"
import { Instance } from "../project/instance"

const parameters = z.object({
  action: z.enum(["list", "add", "update", "delete", "search"]).describe("The action to perform"),
  content: z
    .string()
    .describe("The memory content (required for add/update, used as query for search)")
    .optional(),
  type: MemoryType.describe("Memory category (required for add)").optional(),
  id: z.string().describe("Memory ID (required for update/delete)").optional(),
})

export const MemoryTool = Tool.define("memory", async () => {
  return {
    description: DESCRIPTION,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const projectID = Instance.current.project.id

      switch (params.action) {
        case "list": {
          const memories = await Memory.list(projectID)
          if (memories.length === 0) {
            return {
              title: "List memories",
              metadata: { action: "list", count: 0 } as Record<string, any>,
              output: "No memories found for this project.",
            }
          }
          const lines = memories.map(
            (m) =>
              `[${m.id}] (${m.type}, confidence: ${m.confidence}%) ${m.content}${m.tags.length > 0 ? ` [tags: ${m.tags.join(", ")}]` : ""}`,
          )
          return {
            title: "List memories",
            metadata: { action: "list", count: memories.length } as Record<string, any>,
            output: `Found ${memories.length} memories:\n\n${lines.join("\n")}`,
          }
        }

        case "add": {
          if (!params.content) throw new Error("content is required for add action")
          if (!params.type) throw new Error("type is required for add action")

          const memory = await Memory.create({
            projectID,
            type: params.type,
            content: params.content,
            sourceSession: ctx.sessionID,
          })
          return {
            title: "Add memory",
            metadata: { action: "add", id: memory.id, type: params.type } as Record<string, any>,
            output: `Memory saved: [${memory.id}] ${params.content}`,
          }
        }

        case "update": {
          if (!params.id) throw new Error("id is required for update action")
          if (!params.content) throw new Error("content is required for update action")

          await Memory.update({
            id: params.id,
            content: params.content,
            type: params.type,
          })
          return {
            title: "Update memory",
            metadata: { action: "update", id: params.id } as Record<string, any>,
            output: `Memory ${params.id} updated.`,
          }
        }

        case "delete": {
          if (!params.id) throw new Error("id is required for delete action")

          await Memory.remove(params.id as any)
          return {
            title: "Delete memory",
            metadata: { action: "delete", id: params.id } as Record<string, any>,
            output: `Memory ${params.id} deleted.`,
          }
        }

        case "search": {
          const query = params.content ?? ""
          const memories = await Memory.search({
            projectID,
            query,
            type: params.type,
            limit: 20,
          })
          if (memories.length === 0) {
            return {
              title: "Search memories",
              metadata: { action: "search", query, count: 0 } as Record<string, any>,
              output: `No memories found matching "${query}".`,
            }
          }
          const lines = memories.map(
            (m) => `[${m.id}] (${m.type}, confidence: ${m.confidence}%) ${m.content}`,
          )
          return {
            title: "Search memories",
            metadata: { action: "search", query, count: memories.length } as Record<string, any>,
            output: `Found ${memories.length} memories:\n\n${lines.join("\n")}`,
          }
        }
      }
    },
  }
})
