import { describe, test, expect } from "bun:test"
import { AgentRouter } from "../../src/agent/router"

describe("AgentRouter.classify", () => {
  // --- Explore intent ---
  describe("explore intent", () => {
    const explorePrompts = [
      "What does the authentication middleware do?",
      "Where is the database configuration located?",
      "How does the session management work?",
      "Find all files that import Redis",
      "Show me the API routes",
      "Explain the error handling strategy",
      "Describe the project structure",
      "Tell me about the caching layer",
      "List all exported functions in utils",
      "Search for references to UserService",
      "Locate the main entry point",
      "Examine the test fixtures",
    ]

    for (const prompt of explorePrompts) {
      test(`classifies "${prompt.slice(0, 50)}..." as explore`, () => {
        const result = AgentRouter.classify(prompt)
        expect(result.intent).toBe("explore")
        expect(result.agent).toBe("explore")
        expect(result.confidence).toBeGreaterThanOrEqual(0.7)
      })
    }
  })

  // --- Explore intent (Chinese) ---
  describe("explore intent (Chinese)", () => {
    const chineseExplorePrompts = [
      "这个文件是做什么的？",
      "数据库配置在哪里？",
      "怎么用这个API？",
      "找一下所有的路由定义",
      "查找Redis相关的代码",
      "看看这个模块的结构",
      "解释一下认证流程",
      "分析一下这个函数",
    ]

    for (const prompt of chineseExplorePrompts) {
      test(`classifies "${prompt}" as explore`, () => {
        const result = AgentRouter.classify(prompt)
        expect(result.intent).toBe("explore")
        expect(result.agent).toBe("explore")
      })
    }
  })

  // --- Plan intent ---
  describe("plan intent", () => {
    const planPrompts = [
      "Plan the implementation of the new user dashboard",
      "Design the API architecture for payments",
      "Let's think about the trade-offs between SQL and NoSQL",
      "Write a specification for the auth module",
      "Create an RFC for the new caching strategy",
      "Outline the approach for database migration",
    ]

    for (const prompt of planPrompts) {
      test(`classifies "${prompt.slice(0, 50)}..." as plan`, () => {
        const result = AgentRouter.classify(prompt)
        expect(result.intent).toBe("plan")
        expect(result.agent).toBe("plan")
        expect(result.confidence).toBeGreaterThanOrEqual(0.7)
      })
    }
  })

  // --- Build intent (default) ---
  describe("build intent", () => {
    const buildPrompts = [
      "Implement the user registration feature",
      "Add a new API endpoint for file uploads",
      "Create the database migration for users table",
      "Refactor the auth module to use JWT",
      "Install the redis package and configure it",
      "Update the config to support multiple environments",
      "Delete the deprecated API routes",
    ]

    for (const prompt of buildPrompts) {
      test(`classifies "${prompt.slice(0, 50)}..." as build`, () => {
        const result = AgentRouter.classify(prompt)
        expect(result.intent).toBe("build")
        expect(result.agent).toBe("build")
      })
    }
  })

  // --- Debug intent ---
  describe("debug intent", () => {
    const debugPrompts = [
      "Fix the authentication bug in login flow",
      "The API returns 500 error on user creation",
      "Debug the failing test in session.test.ts",
      "There's a broken import in the config module",
      "The server crashes with a TypeError",
      "Why is the response unexpected?",
    ]

    for (const prompt of debugPrompts) {
      test(`classifies "${prompt.slice(0, 50)}..." as debug`, () => {
        const result = AgentRouter.classify(prompt)
        expect(result.intent).toBe("debug")
        expect(result.agent).toBe("build")
      })
    }
  })

  // --- Mixed intent (explore + build → build wins) ---
  describe("mixed intent (explore + build)", () => {
    test("find and fix → build wins", () => {
      const result = AgentRouter.classify("Find the bug in auth.ts and fix it")
      expect(result.agent).toBe("build")
    })

    test("explain then implement → build wins", () => {
      const result = AgentRouter.classify("Explain the current auth flow and then implement OAuth2")
      expect(result.agent).toBe("build")
    })

    test("search and create → build wins", () => {
      const result = AgentRouter.classify("Where is the config? Create a new environment config")
      expect(result.agent).toBe("build")
    })
  })

  // --- Edge cases ---
  describe("edge cases", () => {
    test("very short prompt defaults to build", () => {
      const result = AgentRouter.classify("hi")
      expect(result.intent).toBe("build")
      expect(result.confidence).toBe(0.5)
    })

    test("empty prompt defaults to build", () => {
      const result = AgentRouter.classify("")
      expect(result.intent).toBe("build")
      expect(result.confidence).toBe(0.5)
    })

    test("single word defaults to build", () => {
      const result = AgentRouter.classify("test")
      // "test" is only 4 chars → defaults to build
      expect(result.agent).toBe("build")
    })

    test("unknown domain language defaults to build", () => {
      const result = AgentRouter.classify("Let's get this party started")
      expect(result.agent).toBe("build")
    })
  })
})

describe("AgentRouter.route", () => {
  const availableAgents = ["build", "plan", "explore", "general"]

  test("explicit agent overrides classification", () => {
    const result = AgentRouter.route({
      prompt: "What does this function do?", // would classify as explore
      explicitAgent: "build",
      availableAgents,
    })
    expect(result.agent).toBe("build")
    expect(result.autoRouted).toBe(false)
    expect(result.classification.intent).toBe("explore") // classification still happens
  })

  test("auto-routes to explore for exploration prompts", () => {
    const result = AgentRouter.route({
      prompt: "How does the authentication system work?",
      availableAgents,
    })
    expect(result.agent).toBe("explore")
    expect(result.autoRouted).toBe(true)
  })

  test("auto-routes to plan for planning prompts", () => {
    const result = AgentRouter.route({
      prompt: "Design the architecture for the new payment system",
      availableAgents,
    })
    expect(result.agent).toBe("plan")
    expect(result.autoRouted).toBe(true)
  })

  test("falls back to build when classified agent not available", () => {
    const result = AgentRouter.route({
      prompt: "How does the auth work?",
      availableAgents: ["build", "general"], // no explore
    })
    expect(result.agent).toBe("build")
    expect(result.autoRouted).toBe(false)
  })

  test("defaults to build for low confidence", () => {
    const result = AgentRouter.route({
      prompt: "do stuff",
      availableAgents,
    })
    expect(result.agent).toBe("build")
    expect(result.autoRouted).toBe(false)
  })
})
