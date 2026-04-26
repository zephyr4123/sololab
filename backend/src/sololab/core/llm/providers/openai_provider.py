"""OpenAI provider —— 直连 api.openai.com，无特殊怪癖。"""

from sololab.core.llm.provider_base import ProviderQuirks
from sololab.core.llm.provider_registry import register_provider
from sololab.core.llm.providers.openai_compatible import OpenAICompatibleProvider


@register_provider
class OpenAIProvider(OpenAICompatibleProvider):
    name = "openai"
    quirks = ProviderQuirks(name="openai")


@register_provider
class OpenAICompatProvider(OpenAICompatibleProvider):
    """通用 OpenAI 兼容兜底（未识别 provider 时走这里，等同零怪癖直连）。"""

    name = "openai_compat"
    quirks = ProviderQuirks(name="openai_compat")
