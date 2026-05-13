"""LLM gateway — thin routing layer over the provider/registry stack.

Responsibilities:
  - pick chat / embed providers from LLMConfig (auto-detect or explicit name)
  - wrap each with CostTrackingProvider so every call is metered, budgeted,
    and traced (see core/llm/cost.py)
  - expose the dict-shaped legacy API (generate / generate_stream / stream / embed)

To add a new provider:
  1. write a class extending OpenAICompatibleProvider in core/llm/providers/
  2. decorate with @register_provider, declare `name` + ProviderQuirks
  3. import it in providers/__init__.py (auto-registration side effect)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, AsyncGenerator, Dict, List, Optional

from pydantic import BaseModel, field_validator

from sololab.core.llm import (
    CostTrackingProvider,
    LLMProviderBase,
    PricingTable,
    ProviderRegistry,
)
from sololab.core.observability import get_logger

if TYPE_CHECKING:
    from sololab.core.cost_tracker import CostTracker
    from sololab.core.observability import BudgetAlert, LLMCallTracer

logger = get_logger("llm_gateway")

# Reject obvious placeholder keys so failures surface at startup, not on first call.
_PLACEHOLDER_KEYS = {"", "sk-xxx", "sk-...", "your-api-key", "your_api_key"}


class LLMConfig(BaseModel):
    """LLM gateway configuration — OpenAI-compatible URL + provider selection."""

    base_url: str = "https://api.openai.com/v1"
    api_key: str
    default_model: str = "gpt-4o"
    # Explicit provider override; otherwise auto-detected from `base_url`.
    provider: Optional[str] = None

    # Independent embedding configuration so chat + embed can live on different vendors.
    embedding_base_url: str = "https://api.openai.com/v1"
    embedding_api_key: str
    embedding_model: str = "text-embedding-3-small"
    embedding_provider: Optional[str] = None

    @field_validator("api_key", "embedding_api_key", mode="before")
    @classmethod
    def _reject_placeholder(cls, v) -> str:
        if v is None:
            raise ValueError(
                "API key is missing. Set IDEASPARK_API_KEY (and "
                "EMBEDDING_API_KEY if different) in .env."
            )
        s = str(v).strip()
        if not s or s in _PLACEHOLDER_KEYS:
            raise ValueError(
                f"API key is set to a placeholder ({v!r}). "
                "Set a real key in .env."
            )
        return s


class LLMGateway:
    """Routes chat/embed calls to the appropriate provider, with cost/trace decoration.

    `cost_tracker`, `tracer`, and `budget_alert` are all optional so the gateway
    can be constructed in test contexts (or before persistence is initialised)
    without losing functionality.
    """

    def __init__(
        self,
        config: LLMConfig,
        *,
        cost_tracker: Optional["CostTracker"] = None,
        tracer: Optional["LLMCallTracer"] = None,
        budget_alert: Optional["BudgetAlert"] = None,
        module_id: Optional[str] = None,
    ) -> None:
        self.config = config
        self._pricing = PricingTable.load_default()

        chat_name = config.provider or ProviderRegistry.detect_from_url(config.base_url)
        chat_inner = ProviderRegistry.create(
            chat_name,
            base_url=config.base_url,
            api_key=config.api_key,
            default_model=config.default_model,
        )
        self._chat: LLMProviderBase = CostTrackingProvider(
            chat_inner,
            pricing=self._pricing,
            cost_tracker=cost_tracker,
            tracer=tracer,
            budget_alert=budget_alert,
            module_id=module_id,
        )

        embed_name = config.embedding_provider or ProviderRegistry.detect_from_url(
            config.embedding_base_url
        )
        embed_inner = ProviderRegistry.create(
            embed_name,
            base_url=config.embedding_base_url,
            api_key=config.embedding_api_key,
            default_model=config.embedding_model,
        )
        self._embed: LLMProviderBase = CostTrackingProvider(
            embed_inner,
            pricing=self._pricing,
            cost_tracker=cost_tracker,
            tracer=tracer,
            budget_alert=budget_alert,
            module_id=module_id,
        )

        logger.info(
            "llm_gateway_ready",
            chat_provider=chat_name,
            chat_model=config.default_model,
            embed_provider=embed_name,
            embed_model=config.embedding_model,
            cost_tracker=cost_tracker is not None,
            tracer=tracer is not None,
        )

    # ── dict-shaped legacy API ────────────────────────────────────────────

    async def generate(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict] = None,
        tools: Optional[List[Dict]] = None,
        **kwargs,
    ) -> dict:
        resp = await self._chat.chat(
            messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            response_format=response_format,
            **kwargs,
        )
        return {
            "content": resp.content,
            "model": resp.model,
            "tool_calls": resp.tool_calls,
            "raw_assistant_message": resp.raw_assistant_message,
            "usage": resp.usage,
        }

    async def generate_stream(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: Optional[List[Dict]] = None,
        **kwargs,
    ) -> AsyncGenerator[dict, None]:
        """Stream chat chunks as legacy-shaped dicts.

        Yields:
            {"type": "reasoning",          "delta": str}
            {"type": "content",            "delta": str}
            {"type": "tool_call_init",     "index": int, "id": str, "name": str}
            {"type": "tool_call_arg_delta","index": int, "delta": str}
            {"type": "done", "content"/"reasoning_content"/"tool_calls"/
                             "raw_assistant_message"/"finish_reason"/"model"/"usage": ...}
        """
        async for chunk in self._chat.chat_stream(
            messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            **kwargs,
        ):
            if chunk.type == "reasoning":
                yield {"type": "reasoning", "delta": chunk.delta}
            elif chunk.type == "content":
                yield {"type": "content", "delta": chunk.delta}
            elif chunk.type == "tool_call_init":
                yield {
                    "type": "tool_call_init",
                    "index": chunk.index,
                    "id": chunk.tool_call_id,
                    "name": chunk.tool_call_name,
                }
            elif chunk.type == "tool_call_arg_delta":
                yield {
                    "type": "tool_call_arg_delta",
                    "index": chunk.index,
                    "delta": chunk.delta,
                }
            elif chunk.type == "done":
                final = chunk.final
                if final is None:
                    yield {"type": "done", "content": "", "tool_calls": None, "usage": {}}
                    continue
                yield {
                    "type": "done",
                    "content": final.content,
                    "reasoning_content": final.reasoning_content,
                    "tool_calls": final.tool_calls,
                    "raw_assistant_message": final.raw_assistant_message,
                    "finish_reason": final.finish_reason,
                    "model": final.model,
                    "usage": final.usage,
                }

    async def stream(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        **kwargs,
    ) -> AsyncGenerator[str, None]:
        """Content-only streaming convenience (used by WriterAI's write_section)."""
        async for chunk in self._chat.chat_stream(
            messages, model=model, temperature=temperature, **kwargs
        ):
            if chunk.type == "content" and chunk.delta:
                yield chunk.delta

    async def embed(
        self, texts: List[str], model: Optional[str] = None
    ) -> List[List[float]]:
        return await self._embed.embed(texts, model=model)

    # ── reflection ────────────────────────────────────────────────────────

    @property
    def chat_provider_name(self) -> str:
        return self._chat.name

    @property
    def embed_provider_name(self) -> str:
        return self._embed.name
