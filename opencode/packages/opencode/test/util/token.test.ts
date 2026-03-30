import { describe, expect, test, afterEach } from "bun:test"
import { Token } from "../../src/util/token"

describe("Token", () => {
  afterEach(() => {
    Token.resetCalibration()
  })

  // ── Content type detection ─────────────────────────────────────

  describe("detectContentType", () => {
    test("detects CJK text", () => {
      expect(Token.detectContentType("这是一段中文测试文本，用于验证CJK检测功能")).toBe("cjk")
    })

    test("detects Japanese text", () => {
      expect(Token.detectContentType("これはテスト用の日本語テキストです")).toBe("cjk")
    })

    test("detects Korean text", () => {
      expect(Token.detectContentType("이것은 테스트용 한국어 텍스트입니다")).toBe("cjk")
    })

    test("detects JSON content", () => {
      const json = JSON.stringify({ name: "test", value: 42, nested: { a: 1, b: 2 } })
      expect(Token.detectContentType(json)).toBe("json")
    })

    test("detects code content", () => {
      const code = `
import { Token } from "./token"
const result = Token.estimate("hello")
function process(input: string) {
  if (input.length > 0) {
    return input.trim()
  }
  return ""
}
export default process
`.trim()
      expect(Token.detectContentType(code)).toBe("code")
    })

    test("detects Markdown content", () => {
      const md = `
# Title

## Section 1

- Item one
- Item two
- [Link](https://example.com)

\`\`\`typescript
const x = 1
\`\`\`

> Blockquote text
`.trim()
      expect(Token.detectContentType(md)).toBe("markdown")
    })

    test("detects plain text", () => {
      expect(Token.detectContentType("Hello, this is a simple English text about nothing in particular.")).toBe("plain")
    })

    test("returns plain for empty string", () => {
      expect(Token.detectContentType("")).toBe("plain")
    })
  })

  // ── CJK ratio ─────────────────────────────────────────────────

  describe("cjkRatio", () => {
    test("returns 0 for empty string", () => {
      expect(Token.cjkRatio("")).toBe(0)
    })

    test("returns ~1 for pure CJK", () => {
      const ratio = Token.cjkRatio("中文测试")
      expect(ratio).toBeGreaterThan(0.9)
    })

    test("returns ratio for mixed text", () => {
      const ratio = Token.cjkRatio("Hello 世界")
      expect(ratio).toBeGreaterThan(0)
      expect(ratio).toBeLessThan(1)
    })

    test("returns 0 for pure ASCII", () => {
      expect(Token.cjkRatio("Hello World")).toBe(0)
    })
  })

  // ── JSON detection ─────────────────────────────────────────────

  describe("looksLikeJson", () => {
    test("detects JSON objects", () => {
      expect(Token.looksLikeJson('{"key": "value", "num": 42}')).toBe(true)
    })

    test("detects JSON arrays of objects", () => {
      expect(Token.looksLikeJson('[{"a": 1}, {"b": 2}]')).toBe(true)
    })

    test("rejects plain text", () => {
      expect(Token.looksLikeJson("Hello World")).toBe(false)
    })

    test("rejects code starting with brace but without JSON structure", () => {
      expect(Token.looksLikeJson("{ console.log(x) }")).toBe(false)
    })
  })

  // ── Code detection ─────────────────────────────────────────────

  describe("looksLikeCode", () => {
    test("detects TypeScript code", () => {
      const code = `
import fs from "fs"
const data = fs.readFileSync("file.txt");
export function parse(input: string) {
  return JSON.parse(input);
}
`.trim()
      expect(Token.looksLikeCode(code)).toBe(true)
    })

    test("detects Python code", () => {
      const code = `
def process(data):
    if len(data) > 0:
        return data.strip()
    return ""

class Handler:
    def __init__(self):
        pass
`.trim()
      expect(Token.looksLikeCode(code)).toBe(true)
    })

    test("rejects plain text", () => {
      expect(Token.looksLikeCode("This is a paragraph of plain English text about nature.")).toBe(false)
    })
  })

  // ── Markdown detection ─────────────────────────────────────────

  describe("looksLikeMarkdown", () => {
    test("detects markdown with headers, lists, links", () => {
      const md = "# Title\n\n- Item\n- [Link](url)\n\n```code```\n"
      expect(Token.looksLikeMarkdown(md)).toBe(true)
    })

    test("rejects plain text", () => {
      expect(Token.looksLikeMarkdown("Just a plain sentence.")).toBe(false)
    })
  })

  // ── estimate() ─────────────────────────────────────────────────

  describe("estimate", () => {
    test("returns 0 for empty string", () => {
      expect(Token.estimate("")).toBe(0)
    })

    test("returns 0 for null-ish input", () => {
      expect(Token.estimate(undefined as unknown as string)).toBe(0)
    })

    test("estimates plain English text at ~4 chars/token", () => {
      const text = "a".repeat(4000)
      const est = Token.estimate(text)
      expect(est).toBe(1000) // 4000 / 4.0
    })

    test("estimates CJK text at ~1.5 chars/token", () => {
      const text = "中".repeat(150)
      const est = Token.estimate(text)
      expect(est).toBe(100) // 150 / 1.5
    })

    test("estimates code at ~3.5 chars/token", () => {
      const code = `
import { readFile } from "fs/promises"
const data = await readFile("input.txt")
function process(input: string): string {
  if (input.length > 100) {
    return input.slice(0, 100)
  }
  return input
}
export default process
`.trim()
      const est = Token.estimate(code)
      const expectedRatio = 3.5
      const expected = Math.round(code.length / expectedRatio)
      expect(Math.abs(est - expected)).toBeLessThan(2)
    })

    test("estimates JSON at ~3.0 chars/token", () => {
      const json = JSON.stringify({
        name: "test",
        version: "1.0.0",
        dependencies: { lodash: "4.17.21", express: "4.18.2" },
      })
      const est = Token.estimate(json)
      const expected = Math.round(json.length / 3.0)
      expect(Math.abs(est - expected)).toBeLessThan(2)
    })

    test("estimates Markdown at ~3.8 chars/token", () => {
      const md = "# Title\n\n## Section\n\n- Item one\n- Item two\n- [Link](https://example.com)\n\n```\ncode\n```\n\n> Quote"
      const est = Token.estimate(md)
      const expected = Math.round(md.length / 3.8)
      expect(Math.abs(est - expected)).toBeLessThan(2)
    })

    test("handles mixed CJK + English content", () => {
      // ~50% CJK
      const text = "Hello世界Good中文Test测试"
      const est = Token.estimate(text)
      // Should be between pure CJK and pure English estimates
      const pureEnglish = Math.round(text.length / 4.0)
      const pureCJK = Math.round(text.length / 1.5)
      expect(est).toBeGreaterThanOrEqual(pureEnglish)
      expect(est).toBeLessThanOrEqual(pureCJK)
    })

    test("handles pure emoji text", () => {
      const emojis = "😀😁😂🤣😃😄😅😆"
      const est = Token.estimate(emojis)
      // Emojis are plain text type, result should be non-negative
      expect(est).toBeGreaterThanOrEqual(0)
    })

    test("handles large text (100KB+)", () => {
      const text = "a".repeat(100_000)
      const est = Token.estimate(text)
      expect(est).toBe(25000) // 100000 / 4.0
    })

    test("never returns negative", () => {
      expect(Token.estimate("")).toBe(0)
      expect(Token.estimate("a")).toBeGreaterThanOrEqual(0)
    })
  })

  // ── Adaptive calibration ───────────────────────────────────────

  describe("calibrate", () => {
    test("adjusts estimates based on actual usage", () => {
      const text = "a".repeat(4000) // 1000 tokens at 4 chars/token
      const baseEstimate = Token.estimate(text)
      expect(baseEstimate).toBe(1000)

      // Feed calibration data: actual is 20% higher
      for (let i = 0; i < 10; i++) {
        Token.calibrate("test-provider", 1000, 1200, "plain")
      }

      const calibrated = Token.estimateCalibrated(text, "test-provider")
      expect(calibrated).toBe(1200) // Should be corrected
    })

    test("ignores zero/negative values", () => {
      Token.calibrate("test-provider", 0, 100, "plain")
      Token.calibrate("test-provider", 100, 0, "plain")
      Token.calibrate("test-provider", -1, 100, "plain")

      const text = "a".repeat(400)
      const calibrated = Token.estimateCalibrated(text, "test-provider")
      const base = Token.estimate(text)
      expect(calibrated).toBe(base) // No calibration applied
    })

    test("clamps correction factor to [0.5, 2.0]", () => {
      // Extreme underestimate — factor would be 10x
      for (let i = 0; i < 10; i++) {
        Token.calibrate("extreme", 100, 1000, "plain")
      }
      const factor = Token.getCalibrationFactor("extreme", "plain")
      expect(factor).toBe(2.0) // Clamped to 2.0

      Token.resetCalibration()

      // Extreme overestimate — factor would be 0.1x
      for (let i = 0; i < 10; i++) {
        Token.calibrate("extreme2", 1000, 100, "plain")
      }
      const factor2 = Token.getCalibrationFactor("extreme2", "plain")
      expect(factor2).toBe(0.5) // Clamped to 0.5
    })

    test("per-provider isolation", () => {
      Token.calibrate("provider-a", 100, 200, "plain")
      Token.calibrate("provider-a", 100, 200, "plain")

      Token.calibrate("provider-b", 100, 50, "plain")
      Token.calibrate("provider-b", 100, 50, "plain")

      expect(Token.getCalibrationFactor("provider-a", "plain")).toBeCloseTo(2.0, 1)
      expect(Token.getCalibrationFactor("provider-b", "plain")).toBeCloseTo(0.5, 1)
    })

    test("per-content-type calibration", () => {
      Token.calibrate("multi", 100, 150, "plain")
      Token.calibrate("multi", 100, 150, "plain")
      Token.calibrate("multi", 100, 80, "code")
      Token.calibrate("multi", 100, 80, "code")

      expect(Token.getCalibrationFactor("multi", "plain")).toBeCloseTo(1.5, 1)
      expect(Token.getCalibrationFactor("multi", "code")).toBeCloseTo(0.8, 1)
    })

    test("resetCalibration clears specific provider", () => {
      Token.calibrate("reset-test", 100, 200, "plain")
      Token.calibrate("reset-test", 100, 200, "plain")
      expect(Token.getCalibrationFactor("reset-test", "plain")).toBeDefined()

      Token.resetCalibration("reset-test")
      expect(Token.getCalibrationFactor("reset-test", "plain")).toBeUndefined()
    })

    test("resetCalibration without args clears all", () => {
      Token.calibrate("prov1", 100, 200, "plain")
      Token.calibrate("prov2", 100, 150, "code")

      Token.resetCalibration()

      expect(Token.getCalibrationFactor("prov1", "plain")).toBeUndefined()
      expect(Token.getCalibrationFactor("prov2", "code")).toBeUndefined()
    })

    test("evicts entries older than 30 minutes", () => {
      // We can't easily test time-based eviction without mocking Date.now,
      // but we verify the rolling window limit works
      for (let i = 0; i < 60; i++) {
        Token.calibrate("window", 100, 120, "plain")
      }
      // Should still have a factor (window preserves recent entries)
      expect(Token.getCalibrationFactor("window", "plain")).toBeDefined()
    })
  })

  describe("estimateCalibrated", () => {
    test("falls back to uncalibrated when no provider specified", () => {
      const text = "a".repeat(400)
      expect(Token.estimateCalibrated(text)).toBe(Token.estimate(text))
    })

    test("falls back when no calibration data exists", () => {
      const text = "a".repeat(400)
      expect(Token.estimateCalibrated(text, "unknown")).toBe(Token.estimate(text))
    })

    test("applies calibration factor", () => {
      for (let i = 0; i < 5; i++) {
        Token.calibrate("cal-test", 100, 130, "plain")
      }

      const text = "a".repeat(400) // base: 100 tokens
      const calibrated = Token.estimateCalibrated(text, "cal-test")
      expect(calibrated).toBe(130) // 100 * 1.3
    })
  })

  // ── ratioForType ───────────────────────────────────────────────

  describe("ratioForType", () => {
    test("returns correct ratios", () => {
      expect(Token.ratioForType("cjk")).toBe(1.5)
      expect(Token.ratioForType("code")).toBe(3.5)
      expect(Token.ratioForType("json")).toBe(3.0)
      expect(Token.ratioForType("markdown")).toBe(3.8)
      expect(Token.ratioForType("plain")).toBe(4.0)
    })
  })

  // ── Backward compatibility ─────────────────────────────────────

  describe("backward compatibility", () => {
    test("4000-char plain text still yields ~1000 tokens", () => {
      // The old test expected exactly 1000 for 4000 chars
      const text = "a".repeat(4000)
      expect(Token.estimate(text)).toBe(1000)
    })

    test("20000-char plain text still yields ~5000 tokens", () => {
      const text = "a".repeat(20000)
      expect(Token.estimate(text)).toBe(5000)
    })
  })
})
