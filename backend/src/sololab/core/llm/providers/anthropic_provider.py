"""Anthropic provider —— 走 OpenAI 兼容层 (api.anthropic.com/v1/)。

主要怪癖：
- temperature ≤ 1.0（兼容层硬限制，超出会被 clamp）
- 单一 system message hoisted to beginning（OpenAI 兼容层自动处理）
- strict tool param 被忽略（不影响功能）

参考：https://platform.claude.com/docs/en/api/openai-sdk
"""

from sololab.core.llm.provider_base import ProviderQuirks
from sololab.core.llm.provider_registry import register_provider
from sololab.core.llm.providers.openai_compatible import OpenAICompatibleProvider


@register_provider
class AnthropicProvider(OpenAICompatibleProvider):
    name = "anthropic"
    quirks = ProviderQuirks(
        name="anthropic",
        supports_thinking=False,  # OpenAI 兼容层不暴露 extended thinking
        temperature_max=1.0,
    )
