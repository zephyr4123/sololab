import z from "zod"
import { Config } from "../config/config"
import { sortBy } from "remeda"
import { NoSuchModelError } from "ai"
import { Log } from "../util/log"
import { NamedError } from "@opencode-ai/util/error"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import { Env } from "../env"
import { Instance } from "../project/instance"
import { ProviderTransform } from "./transform"
import { ModelID, ProviderID } from "./schema"

// SDK imports — only the 4 we actually need
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

export namespace Provider {
  const log = Log.create({ service: "provider" })

  // ─── SSE chunk-timeout wrapper (production reliability) ────────────────────

  function wrapSSE(res: Response, ms: number, ctl: AbortController) {
    if (typeof ms !== "number" || ms <= 0) return res
    if (!res.body) return res
    if (!res.headers.get("content-type")?.includes("text/event-stream")) return res

    const reader = res.body.getReader()
    const body = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        const part = await new Promise<Awaited<ReturnType<typeof reader.read>>>((resolve, reject) => {
          const id = setTimeout(() => {
            const err = new Error("SSE read timed out")
            ctl.abort(err)
            void reader.cancel(err)
            reject(err)
          }, ms)

          reader.read().then(
            (part) => {
              clearTimeout(id)
              resolve(part)
            },
            (err) => {
              clearTimeout(id)
              reject(err)
            },
          )
        })

        if (part.done) {
          ctrl.close()
          return
        }

        ctrl.enqueue(part.value)
      },
      async cancel(reason) {
        ctl.abort(reason)
        await reader.cancel(reason)
      },
    })

    return new Response(body, {
      headers: new Headers(res.headers),
      status: res.status,
      statusText: res.statusText,
    })
  }

  // ─── Types ─────────────────────────────────────────────────────────────────

  type BundledSDK = {
    languageModel(modelId: string): LanguageModelV3
  }

  type SDKResult = {
    sdk: BundledSDK
    npm: string
    modelLoader?: (sdk: any, modelID: string) => any
  }

  // ─── SDK resolution: 3 env vars → Vercel AI SDK ───────────────────────────
  //
  // Logic:
  //   CODELAB_BASE_URL set   → createOpenAICompatible (works for 90% of providers)
  //   CODELAB_BASE_URL unset → detect native SDK from providerID (anthropic/openai/google)
  //
  // This replaces BUNDLED_PROVIDERS (20 imports), CUSTOM_LOADERS (700 lines),
  // and the entire registry concept.

  function resolveSDK(
    providerID: string,
    apiKey: string,
    baseURL: string | undefined,
    providerOptions: Record<string, any> = {},
  ): SDKResult {
    const timeout = providerOptions.timeout as number | undefined
    const chunkTimeout = providerOptions.chunkTimeout as number | undefined

    // Build custom fetch with timeout + SSE chunk-timeout support
    const customFetch = async (input: any, init?: any) => {
      const opts = init ?? {}
      const signals: AbortSignal[] = []
      if (opts.signal) signals.push(opts.signal)
      if (typeof timeout === "number" && timeout > 0) signals.push(AbortSignal.timeout(timeout))

      const chunkAbortCtl = typeof chunkTimeout === "number" && chunkTimeout > 0 ? new AbortController() : undefined
      if (chunkAbortCtl) signals.push(chunkAbortCtl.signal)

      if (signals.length > 0) {
        opts.signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals)
      }

      const res = await fetch(input, {
        ...opts,
        // @ts-ignore https://github.com/oven-sh/bun/issues/16682
        timeout: false,
      })
      return chunkAbortCtl ? wrapSSE(res, chunkTimeout!, chunkAbortCtl) : res
    }

    const commonOpts = {
      apiKey,
      fetch: customFetch as typeof globalThis.fetch,
      ...providerOptions.headers ? { headers: providerOptions.headers } : {},
    }

    // ── Path 1: Base URL provided → OpenAI-compatible (covers most providers) ──
    if (baseURL) {
      return {
        sdk: createOpenAICompatible({
          name: providerID,
          baseURL,
          ...commonOpts,
        }) as unknown as BundledSDK,
        npm: "@ai-sdk/openai-compatible",
      }
    }

    // ── Path 2: No base URL → use native SDK for well-known providers ──
    switch (providerID) {
      case "anthropic":
        return {
          sdk: createAnthropic({
            ...commonOpts,
            headers: {
              "anthropic-beta": "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
              ...commonOpts.headers,
            },
          }) as unknown as BundledSDK,
          npm: "@ai-sdk/anthropic",
        }
      case "openai":
        return {
          sdk: createOpenAI(commonOpts) as unknown as BundledSDK,
          npm: "@ai-sdk/openai",
          modelLoader: (sdk: any, id: string) => sdk.responses(id),
        }
      case "google":
        return {
          sdk: createGoogleGenerativeAI(commonOpts) as unknown as BundledSDK,
          npm: "@ai-sdk/google",
        }
      default:
        throw new Error(
          `CODELAB_BASE_URL is required for provider "${providerID}". ` +
            `Only anthropic/openai/google can work without a base URL.`,
        )
    }
  }

  // ─── Default model metadata ────────────────────────────────────────────────

  function defaultCapabilities(npm: string): Model["capabilities"] {
    const isAnthropic = npm === "@ai-sdk/anthropic"
    return {
      temperature: true,
      reasoning: isAnthropic,
      attachment: true,
      toolcall: true,
      input: { text: true, audio: false, image: !npm.includes("compatible"), video: false, pdf: isAnthropic },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: isAnthropic,
    }
  }

  function buildModel(providerID: string, modelID: string, npm: string, baseURL: string): Model {
    const model: Model = {
      id: ModelID.make(modelID),
      providerID: ProviderID.make(providerID),
      name: modelID,
      family: "",
      api: { id: modelID, url: baseURL, npm },
      status: "active",
      headers: {},
      options: {},
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: { context: 128_000, output: 16_384 },
      capabilities: defaultCapabilities(npm),
      release_date: "",
      variants: {},
    }
    model.variants = { ...ProviderTransform.variants(model) }
    return model
  }

  // ─── Zod schemas (unchanged — consumed by entire codebase) ─────────────────

  export const Model = z
    .object({
      id: ModelID.zod,
      providerID: ProviderID.zod,
      api: z.object({
        id: z.string(),
        url: z.string(),
        npm: z.string(),
      }),
      name: z.string(),
      family: z.string().optional(),
      capabilities: z.object({
        temperature: z.boolean(),
        reasoning: z.boolean(),
        attachment: z.boolean(),
        toolcall: z.boolean(),
        input: z.object({
          text: z.boolean(),
          audio: z.boolean(),
          image: z.boolean(),
          video: z.boolean(),
          pdf: z.boolean(),
        }),
        output: z.object({
          text: z.boolean(),
          audio: z.boolean(),
          image: z.boolean(),
          video: z.boolean(),
          pdf: z.boolean(),
        }),
        interleaved: z.union([
          z.boolean(),
          z.object({
            field: z.enum(["reasoning_content", "reasoning_details"]),
          }),
        ]),
      }),
      cost: z.object({
        input: z.number(),
        output: z.number(),
        cache: z.object({
          read: z.number(),
          write: z.number(),
        }),
        experimentalOver200K: z
          .object({
            input: z.number(),
            output: z.number(),
            cache: z.object({
              read: z.number(),
              write: z.number(),
            }),
          })
          .optional(),
      }),
      limit: z.object({
        context: z.number(),
        input: z.number().optional(),
        output: z.number(),
      }),
      status: z.enum(["alpha", "beta", "deprecated", "active"]),
      options: z.record(z.string(), z.any()),
      headers: z.record(z.string(), z.string()),
      release_date: z.string(),
      variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
    })
    .meta({
      ref: "Model",
    })
  export type Model = z.infer<typeof Model>

  export const Info = z
    .object({
      id: ProviderID.zod,
      name: z.string(),
      source: z.enum(["env", "config", "custom", "api"]),
      env: z.string().array(),
      key: z.string().optional(),
      options: z.record(z.string(), z.any()),
      models: z.record(z.string(), Model),
    })
    .meta({
      ref: "Provider",
    })
  export type Info = z.infer<typeof Info>

  // ─── State: one provider, env-driven ───────────────────────────────────────
  //
  // Reads CODELAB_MODEL / CODELAB_API_KEY / CODELAB_BASE_URL once,
  // creates the single configured provider + model + SDK.

  const state = Instance.state(async () => {
    using _ = log.time("state")

    const config = await Config.get()
    if (!config.model) {
      throw new Error(
        "CODELAB_MODEL is required. Set it in .env (e.g., CODELAB_MODEL=anthropic/claude-sonnet-4-5)",
      )
    }

    const { providerID, modelID } = parseModel(config.model)
    const apiKey = Env.get("CODELAB_API_KEY") ?? ""
    const baseURL = Env.get("CODELAB_BASE_URL") || undefined

    // Merge config provider options if any
    const configProvider = config.provider?.[providerID]
    const providerOptions = configProvider?.options ?? {}

    // Resolve SDK
    const sdkResult = resolveSDK(providerID, apiKey, baseURL, providerOptions)
    log.info("resolved", { providerID, npm: sdkResult.npm, hasBaseURL: !!baseURL })

    // Build model with defaults + config overrides
    const model = buildModel(providerID, modelID, sdkResult.npm, baseURL ?? "")

    // Apply config model overrides if any
    const configModel = configProvider?.models?.[modelID]
    if (configModel) {
      if (configModel.limit) {
        if (configModel.limit.context) model.limit.context = configModel.limit.context
        if (configModel.limit.output) model.limit.output = configModel.limit.output
      }
      if (configModel.reasoning !== undefined) model.capabilities.reasoning = configModel.reasoning
      if (configModel.temperature !== undefined) model.capabilities.temperature = configModel.temperature
      if (configModel.tool_call !== undefined) model.capabilities.toolcall = configModel.tool_call
      if (configModel.headers) model.headers = { ...model.headers, ...configModel.headers }
      if (configModel.options) model.options = { ...model.options, ...configModel.options }
      // Regenerate variants after overrides
      model.variants = { ...ProviderTransform.variants(model) }
    }

    // Build provider info
    const provider: Info = {
      id: ProviderID.make(providerID),
      name: configProvider?.name ?? providerID,
      source: "env",
      env: ["CODELAB_API_KEY"],
      key: apiKey,
      options: providerOptions,
      models: { [modelID]: model },
    }

    const providers: Record<ProviderID, Info> = {} as Record<ProviderID, Info>
    providers[ProviderID.make(providerID)] = provider

    const languages = new Map<string, LanguageModelV3>()
    const modelLoaders: Record<string, (sdk: any, modelID: string) => any> = {}
    if (sdkResult.modelLoader) modelLoaders[providerID] = sdkResult.modelLoader

    return {
      providers,
      models: languages,
      sdkInstance: sdkResult.sdk,
      modelLoaders,
      npm: sdkResult.npm,
      baseURL: baseURL ?? "",
    }
  })

  // ─── Public API ────────────────────────────────────────────────────────────

  export async function list() {
    return state().then((s) => s.providers)
  }

  export async function getProvider(providerID: ProviderID) {
    return state().then((s) => s.providers[providerID])
  }

  export async function getModel(providerID: ProviderID, modelID: ModelID) {
    const s = await state()
    const provider = s.providers[providerID]
    if (provider?.models[modelID]) return provider.models[modelID]

    // Same provider, different model → create on-the-fly (handles small_model)
    if (provider) {
      const model = buildModel(providerID, modelID, s.npm, s.baseURL)
      provider.models[modelID] = model
      return model
    }

    throw new ModelNotFoundError({ providerID, modelID })
  }

  export async function getLanguage(model: Model): Promise<LanguageModelV3> {
    const s = await state()
    const key = `${model.providerID}/${model.id}`
    if (s.models.has(key)) return s.models.get(key)!

    try {
      const language = s.modelLoaders[model.providerID]
        ? await s.modelLoaders[model.providerID](s.sdkInstance, model.api.id)
        : s.sdkInstance.languageModel(model.api.id)
      s.models.set(key, language)
      return language
    } catch (e) {
      if (e instanceof NoSuchModelError) {
        throw new ModelNotFoundError(
          { modelID: model.id, providerID: model.providerID },
          { cause: e },
        )
      }
      throw e
    }
  }

  export async function getSmallModel(_providerID: ProviderID) {
    const cfg = await Config.get()
    if (cfg.small_model) {
      try {
        const parsed = parseModel(cfg.small_model)
        return await getModel(parsed.providerID, parsed.modelID)
      } catch {
        // Different provider or unavailable — fall through to main model
      }
    }
    // Return the configured model
    const s = await state()
    const provider = Object.values(s.providers)[0]
    return provider ? Object.values(provider.models)[0] : undefined
  }

  const priority = ["gpt-5", "claude-sonnet-4", "big-pickle", "gemini-3-pro"]
  export function sort<T extends { id: string }>(models: T[]) {
    return sortBy(
      models,
      [(model) => priority.findIndex((filter) => model.id.includes(filter)), "desc"],
      [(model) => (model.id.includes("latest") ? 0 : 1), "asc"],
      [(model) => model.id, "desc"],
    )
  }

  export async function defaultModel() {
    const cfg = await Config.get()
    if (cfg.model) return parseModel(cfg.model)
    throw new Error("CODELAB_MODEL is required")
  }

  export function parseModel(model: string) {
    const [providerID, ...rest] = model.split("/")
    return {
      providerID: ProviderID.make(providerID),
      modelID: ModelID.make(rest.join("/")),
    }
  }

  // ─── Errors ────────────────────────────────────────────────────────────────

  export const ModelNotFoundError = NamedError.create(
    "ProviderModelNotFoundError",
    z.object({
      providerID: ProviderID.zod,
      modelID: ModelID.zod,
      suggestions: z.array(z.string()).optional(),
    }),
  )

  export const InitError = NamedError.create(
    "ProviderInitError",
    z.object({
      providerID: ProviderID.zod,
    }),
  )
}
