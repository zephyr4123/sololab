import { Instance } from "../project/instance"

import PROMPT_UNIFIED from "./prompt/unified.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"

export namespace SystemPrompt {
  /**
   * 统一系统提示词 —— 所有模型使用同一套提示词，消除 provider 分裂。
   * 模型差异通过 environment() 中的动态信息注入处理。
   */
  export function provider(_model: Provider.Model) {
    return [PROMPT_UNIFIED]
  }

  export async function environment(model: Provider.Model) {
    const project = Instance.project
    return [
      [
        `# 环境信息`,
        `你正在以下环境中运行：`,
        ` - 当前模型：${model.api.id}（完整 ID：${model.providerID}/${model.api.id}）`,
        ` - 工作目录：${Instance.directory}`,
        ` - 工作区根目录：${Instance.worktree}`,
        ` - 是否为 Git 仓库：${project.vcs === "git" ? "是" : "否"}`,
        ` - 平台：${process.platform}`,
        ` - 今日日期：${new Date().toLocaleDateString("zh-CN")}`,
      ].join("\n"),
    ]
  }

  export async function skills(agent: Agent.Info) {
    if (Permission.disabled(["skill"], agent.permission).has("skill")) return

    const list = await Skill.available(agent)

    return [
      "技能提供针对特定任务的专门指令和工作流。",
      "当任务匹配技能描述时，使用技能工具加载它。",
      Skill.fmt(list, { verbose: true }),
    ].join("\n")
  }
}
