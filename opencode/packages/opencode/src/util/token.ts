/**
 * Token estimation with content-aware heuristics and adaptive calibration.
 *
 * Default ratios (chars-per-token) are tuned for BPE tokenizers (cl100k / o200k):
 *   - CJK text   ≈ 1.5 chars/token  (each character often becomes its own token)
 *   - Code       ≈ 3.5 chars/token  (keywords + operators are compact)
 *   - JSON       ≈ 3.0 chars/token  (braces, colons, quotes add overhead)
 *   - Markdown   ≈ 3.8 chars/token  (lightweight syntax)
 *   - Plain text ≈ 4.0 chars/token  (classic BPE average for English)
 */
export namespace Token {
  // ── Content-type ratios (chars per token) ─────────────────────────
  const RATIO_CJK = 1.5
  const RATIO_CODE = 3.5
  const RATIO_JSON = 3.0
  const RATIO_MARKDOWN = 3.8
  const RATIO_PLAIN = 4.0

  // ── Detection helpers ─────────────────────────────────────────────

  // CJK Unified Ideographs + common CJK ranges + Kana + Hangul
  const CJK_REGEX =
    /[\u2E80-\u2FFF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3100-\u312F\u3200-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/g

  /** Fraction of characters that are CJK (0-1). */
  export function cjkRatio(input: string): number {
    if (!input) return 0
    const matches = input.match(CJK_REGEX)
    return matches ? matches.length / input.length : 0
  }

  /** Heuristic: looks like JSON (starts with { or [, contains colons/quotes). */
  export function looksLikeJson(input: string): boolean {
    const trimmed = input.trimStart()
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false
    // Quick structural check – at least a few key:value patterns
    const colonCount = (trimmed.match(/": ?/g) || []).length
    return colonCount >= 2
  }

  /** Heuristic: looks like source code (braces, semicolons, function keywords). */
  export function looksLikeCode(input: string): boolean {
    const lines = input.slice(0, 2000).split("\n")
    let codeSignals = 0
    for (const line of lines) {
      if (/^\s*(import |export |const |let |var |function |class |def |fn |pub |async |return |if |for |while )/.test(line)) codeSignals++
      if (/[{};()]/.test(line)) codeSignals++
    }
    return codeSignals / Math.max(lines.length, 1) > 0.3
  }

  /** Heuristic: looks like Markdown (headings, lists, links, code fences). */
  export function looksLikeMarkdown(input: string): boolean {
    const sample = input.slice(0, 2000)
    let mdSignals = 0
    if (/^#{1,6} /m.test(sample)) mdSignals += 2
    if (/^\s*[-*+] /m.test(sample)) mdSignals++
    if (/\[.*?\]\(.*?\)/.test(sample)) mdSignals++
    if (/```/.test(sample)) mdSignals += 2
    if (/^\s*>\s/m.test(sample)) mdSignals++
    return mdSignals >= 3
  }

  // ── Content-type detection ────────────────────────────────────────

  export type ContentType = "cjk" | "code" | "json" | "markdown" | "plain"

  /** Detect the dominant content type of a string. */
  export function detectContentType(input: string): ContentType {
    if (!input || input.length === 0) return "plain"
    if (cjkRatio(input) > 0.3) return "cjk"
    if (looksLikeJson(input)) return "json"
    if (looksLikeCode(input)) return "code"
    if (looksLikeMarkdown(input)) return "markdown"
    return "plain"
  }

  /** Return the chars-per-token ratio for a content type. */
  export function ratioForType(type: ContentType): number {
    switch (type) {
      case "cjk":
        return RATIO_CJK
      case "code":
        return RATIO_CODE
      case "json":
        return RATIO_JSON
      case "markdown":
        return RATIO_MARKDOWN
      case "plain":
        return RATIO_PLAIN
    }
  }

  // ── Weighted estimation ───────────────────────────────────────────

  /**
   * Estimate token count with content-aware heuristics.
   *
   * For mixed content (e.g. CJK + code), a weighted blend is used
   * based on the CJK character fraction.
   */
  export function estimate(input: string): number {
    if (!input) return 0
    const len = input.length

    const cjk = cjkRatio(input)
    const type = detectContentType(input)

    // For content with significant CJK, blend CJK ratio with base ratio
    if (cjk > 0.05 && type !== "cjk") {
      const baseRatio = ratioForType(type)
      const blended = cjk * RATIO_CJK + (1 - cjk) * baseRatio
      return Math.max(0, Math.round(len / blended))
    }

    return Math.max(0, Math.round(len / ratioForType(type)))
  }

  // ── Adaptive calibration ──────────────────────────────────────────

  interface CalibrationEntry {
    predicted: number
    actual: number
    type: ContentType
    timestamp: number
  }

  const CALIBRATION_WINDOW = 50 // rolling window size
  const CALIBRATION_MAX_AGE = 30 * 60 * 1000 // 30 minutes

  // Per-provider calibration state
  const calibrations = new Map<
    string,
    {
      entries: CalibrationEntry[]
      // Per-type correction factors (multiplied against estimate)
      factors: Map<ContentType, number>
    }
  >()

  /** Get or create calibration state for a provider. */
  function getCalibration(providerID: string) {
    let cal = calibrations.get(providerID)
    if (!cal) {
      cal = { entries: [], factors: new Map() }
      calibrations.set(providerID, cal)
    }
    return cal
  }

  /**
   * Record an actual token count from a provider response.
   * This feeds the adaptive calibration system.
   */
  export function calibrate(providerID: string, predicted: number, actual: number, type: ContentType): void {
    if (actual <= 0 || predicted <= 0) return
    const cal = getCalibration(providerID)
    const now = Date.now()

    cal.entries.push({ predicted, actual, type, timestamp: now })

    // Evict old entries
    const cutoff = now - CALIBRATION_MAX_AGE
    cal.entries = cal.entries.filter((e) => e.timestamp > cutoff).slice(-CALIBRATION_WINDOW)

    // Recalculate per-type factors
    const byType = new Map<ContentType, { sumPredicted: number; sumActual: number }>()
    for (const entry of cal.entries) {
      const acc = byType.get(entry.type) ?? { sumPredicted: 0, sumActual: 0 }
      acc.sumPredicted += entry.predicted
      acc.sumActual += entry.actual
      byType.set(entry.type, acc)
    }

    for (const [t, acc] of byType) {
      if (acc.sumPredicted > 0) {
        // Clamp factor to [0.5, 2.0] to prevent wild swings
        const raw = acc.sumActual / acc.sumPredicted
        cal.factors.set(t, Math.min(2.0, Math.max(0.5, raw)))
      }
    }
  }

  /**
   * Get the calibrated estimate for a provider.
   * Falls back to uncalibrated estimate if no calibration data exists.
   */
  export function estimateCalibrated(input: string, providerID?: string): number {
    const base = estimate(input)
    if (!providerID) return base

    const cal = calibrations.get(providerID)
    if (!cal) return base

    const type = detectContentType(input)
    const factor = cal.factors.get(type)
    if (!factor) return base

    return Math.max(0, Math.round(base * factor))
  }

  /** Get the current calibration factor for a provider + content type. */
  export function getCalibrationFactor(providerID: string, type: ContentType): number | undefined {
    return calibrations.get(providerID)?.factors.get(type)
  }

  /** Reset calibration data (useful for testing). */
  export function resetCalibration(providerID?: string): void {
    if (providerID) {
      calibrations.delete(providerID)
    } else {
      calibrations.clear()
    }
  }
}
