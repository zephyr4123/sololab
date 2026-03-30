import { Log } from "../util/log"

export namespace AgentRouter {
  const log = Log.create({ service: "agent.router" })

  export type Intent = "explore" | "plan" | "build" | "debug" | "test"

  export interface Classification {
    intent: Intent
    agent: string
    confidence: number
  }

  // Keyword patterns for intent classification
  // Ordered by specificity — first match wins
  const patterns: { intent: Intent; agent: string; keywords: RegExp; confidence: number }[] = [
    // Debug intent: fix bugs, troubleshoot (still uses build agent) — check BEFORE explore
    {
      intent: "debug",
      agent: "build",
      keywords:
        /\b(fix|bug|error|broken|fail(?:ed|ing|s)?|debug|issue|problem|crash(?:es|ed)?|exception|traceback|stacktrace|not working|doesn't work|wrong|incorrect|unexpected)\b/i,
      confidence: 0.7,
    },
    // Debug: Chinese equivalents
    {
      intent: "debug",
      agent: "build",
      keywords:
        /(?:修复|bug|错误|故障|失败|调试|问题|崩溃|异常|不工作|不对|不正确|报错)/,
      confidence: 0.7,
    },
    // Explore intent: questions about code, finding things, understanding
    {
      intent: "explore",
      agent: "explore",
      keywords:
        /\b(what|where|how does|find|show|explain|describe|tell me about|look at|search for|list all|which files?|locate|understand|read|overview|summarize|walkthrough|trace|follow|examine)\b/i,
      confidence: 0.8,
    },
    // Explore: Chinese equivalents
    {
      intent: "explore",
      agent: "explore",
      keywords:
        /(什么|哪里|怎么[^样]|查找|搜索|看看|解释|描述|告诉我|列出|定位|理解|概述|总结|追踪|查看|分析一下|看一下|是做|在哪|是什么)/,
      confidence: 0.8,
    },
    // Plan intent: design, architect, plan
    {
      intent: "plan",
      agent: "plan",
      keywords:
        /\b(plan|design|architect|strategy|approach|roadmap|spec|specification|rfc|proposal|outline|think about|consider|trade-?offs?|compare options)\b/i,
      confidence: 0.75,
    },
    // Plan: Chinese equivalents
    {
      intent: "plan",
      agent: "plan",
      keywords:
        /(计划|设计|架构|策略|方案|规划|规格|提案|大纲|思考|考虑|权衡|对比方案)/,
      confidence: 0.75,
    },
    // Test intent: testing, coverage (uses build agent)
    {
      intent: "test",
      agent: "build",
      keywords:
        /\b(testing|spec|coverage|assert|expect|mock|stub|fixture|playwright|vitest|jest|pytest|unit test|integration test|e2e)\b/i,
      confidence: 0.65,
    },
  ]

  // Patterns that strongly indicate build intent (modifications)
  const buildIndicators =
    /\b(implement|create|add|write|make|build|update|change|modify|refactor|rename|delete|remove|replace|move|extract|install|setup|configure|deploy|migrate|upgrade|convert)\b/i
  // Note: avoid ambiguous Chinese terms like 做 (can mean "does"), 配置 (can be noun "configuration")
  const buildIndicatorsChinese =
    /(实现|创建|添加|编写|制作|构建|更新|修改|重构|重命名|删除|移除|替换|移动|提取|安装|部署|迁移|升级|转换|开发|完成|去配置|来配置|配置一下)/

  // Strong question patterns that indicate explore intent even when debug keywords are present
  const questionPatterns =
    /\b(what|where|how does|explain|describe|tell me about|show me|understand|overview|summarize)\b/i
  const questionPatternsChinese =
    /(什么|哪里|哪个|怎么[^样]?|解释|描述|告诉我|看看|查看|分析一下|看一下|是做|在哪|是什么|概述|总结|找一下|查找|搜索)/

  /**
   * Classify user prompt intent using keyword-based rules.
   * No LLM call — runs in <1ms.
   */
  export function classify(prompt: string): Classification {
    const text = prompt.trim()

    // Very short prompts (< 5 chars) → default to build
    if (text.length < 5) {
      return { intent: "build", agent: "build", confidence: 0.5 }
    }

    // Question-based prompts take priority → explore
    const isQuestion = questionPatterns.test(text) || questionPatternsChinese.test(text)
    const hasBuildIndicators = buildIndicators.test(text) || buildIndicatorsChinese.test(text)

    if (isQuestion && !hasBuildIndicators) {
      return { intent: "explore", agent: "explore", confidence: 0.8 }
    }

    // If both question and build → build (mixed intent)
    if (isQuestion && hasBuildIndicators) {
      return { intent: "build", agent: "build", confidence: 0.6 }
    }

    // Check remaining patterns
    for (const pattern of patterns) {
      if (pattern.keywords.test(text)) {
        if (
          pattern.intent === "explore" &&
          hasBuildIndicators
        ) {
          return { intent: "build", agent: "build", confidence: 0.6 }
        }
        return { intent: pattern.intent, agent: pattern.agent, confidence: pattern.confidence }
      }
    }

    // Default: build agent
    return { intent: "build", agent: "build", confidence: 0.5 }
  }

  /**
   * Determine agent for a prompt, respecting user overrides.
   * Returns the agent name to use and whether it was auto-routed.
   */
  export function route(input: {
    prompt: string
    explicitAgent?: string
    availableAgents: string[]
  }): { agent: string; autoRouted: boolean; classification: Classification } {
    const classification = classify(input.prompt)

    // User explicitly specified agent → always use that
    if (input.explicitAgent) {
      return {
        agent: input.explicitAgent,
        autoRouted: false,
        classification,
      }
    }

    // Check if classified agent is available
    if (input.availableAgents.includes(classification.agent)) {
      // Only auto-route with sufficient confidence
      if (classification.confidence >= 0.7) {
        log.info("auto-routed", {
          intent: classification.intent,
          agent: classification.agent,
          confidence: classification.confidence,
        })
        return {
          agent: classification.agent,
          autoRouted: true,
          classification,
        }
      }
    }

    // Default to build
    return {
      agent: "build",
      autoRouted: false,
      classification,
    }
  }
}
