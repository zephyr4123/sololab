"""成本追踪 Decorator —— 包裹任意 LLMProviderBase，透明计算每次调用费用。

用法：
    inner = ProviderRegistry.create("deepseek", ...)
    provider = CostTrackingProvider(inner, pricing=PricingTable.load_default())
    response = await provider.chat(...)
    response.usage["cost_usd"]  # 已自动填充

非侵入：底层 provider 不感知定价表存在；切换/扩展 provider 时无需改 provider 代码。
"""

from __future__ import annotations

from typing import Any, AsyncGenerator, Dict, List, Optional

from sololab.core.llm.pricing import PricingTable
from sololab.core.llm.provider_base import (
    ChatChunk,
    ChatResponse,
    LLMProviderBase,
    ProviderQuirks,
)


class CostTrackingProvider(LLMProviderBase):
    """装饰器：在底层 provider 返回值上叠加 cost_usd。"""

    name = "cost_tracking_decorator"
    quirks = ProviderQuirks(name="cost_tracking_decorator")

    def __init__(self, inner: LLMProviderBase, pricing: PricingTable) -> None:
        # 故意不调用父类 __init__（不是真实 provider，没有 base_url/api_key）
        self._inner = inner
        self._pricing = pricing
        # 把内层 provider 的属性透出来，便于上层判断
        self.name = inner.name  # type: ignore[misc]
        self.quirks = inner.quirks  # type: ignore[misc]

    @property
    def default_model(self) -> str:
        return self._inner.default_model

    def _fill_cost(self, usage: Dict[str, Any], model: str) -> None:
        cost = self._pricing.estimate(
            model,
            usage.get("prompt_tokens", 0) or 0,
            usage.get("completion_tokens", 0) or 0,
        )
        usage["cost_usd"] = cost

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: Optional[List[Dict[str, Any]]] = None,
        response_format: Optional[Dict[str, Any]] = None,
        **opts: Any,
    ) -> ChatResponse:
        resp = await self._inner.chat(
            messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            response_format=response_format,
            **opts,
        )
        self._fill_cost(resp.usage, resp.model or model or self._inner.default_model)
        return resp

    async def chat_stream(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: Optional[List[Dict[str, Any]]] = None,
        **opts: Any,
    ) -> AsyncGenerator[ChatChunk, None]:
        async for chunk in self._inner.chat_stream(
            messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            **opts,
        ):
            if chunk.type == "done" and chunk.final is not None:
                self._fill_cost(
                    chunk.final.usage,
                    chunk.final.model or model or self._inner.default_model,
                )
            yield chunk

    async def embed(self, texts: List[str], *, model: Optional[str] = None) -> List[List[float]]:
        return await self._inner.embed(texts, model=model)
