"""Qwen / 阿里通义 provider —— 走 dashscope OpenAI 兼容端点。

部分 Qwen3 系列模型默认开 thinking 模式（如 qwen3.6-plus），可通过
`extra_body={"enable_thinking": false}` 关闭。本 provider 默认不强制开关，
保留模型默认行为；调用方可通过 opts 覆盖。

参考：https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-calling-api
"""

from sololab.core.llm.provider_base import ProviderQuirks
from sololab.core.llm.provider_registry import register_provider
from sololab.core.llm.providers.openai_compatible import OpenAICompatibleProvider


@register_provider
class QwenProvider(OpenAICompatibleProvider):
    name = "qwen"
    quirks = ProviderQuirks(
        name="qwen",
        supports_thinking=True,           # qwen3+ 系列支持
        requires_reasoning_passback=False,  # 与 DeepSeek 不同，未观察到强制回传
    )
