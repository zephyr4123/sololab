"""LLM Provider 抽象层 — 提供 Strategy + Factory + Registry 模式。

模块布局：
- provider_base   : LLMProviderBase ABC + ProviderQuirks + ChatResponse / ChatChunk
- provider_registry: ProviderRegistry（register / create / detect_from_url）
- pricing         : PricingTable + estimate_cost
- cost            : CostTrackingProvider 装饰器
- providers/      : 具体实现（OpenAI / DeepSeek / Anthropic / Qwen 等）
"""

from sololab.core.llm.cost import CostTrackingProvider
from sololab.core.llm.pricing import PricingTable
from sololab.core.llm.provider_base import (
    ChatChunk,
    ChatResponse,
    LLMProviderBase,
    ProviderQuirks,
)
from sololab.core.llm.provider_registry import ProviderRegistry, register_provider

# 导入 providers 包触发自动注册
from sololab.core.llm import providers  # noqa: F401  (副作用：注册到 ProviderRegistry)

__all__ = [
    "LLMProviderBase",
    "ProviderQuirks",
    "ChatResponse",
    "ChatChunk",
    "ProviderRegistry",
    "register_provider",
    "PricingTable",
    "CostTrackingProvider",
]
