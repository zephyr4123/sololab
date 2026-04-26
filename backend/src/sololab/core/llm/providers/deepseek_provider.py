"""DeepSeek provider —— 处理 V4 系列的两个特定怪癖：

1. **Thinking 模式 reasoning_content 多轮强制回传** —— 父类已通过 model_extra
   收集 reasoning_content 并写入 raw_assistant_message，本类只声明 quirks 让
   上层（agent_runner / orchestrator）感知。

2. **DSML tool-call 标记偶发泄漏到 content** —— 兼容层翻译失败时模型会把
   `<|DSML|tool_calls>...</|DSML|tool_calls>` 直接写进 content 字段。
   本类在 _post_process_content 主动剥离，避免下游看到。

参考：
- https://api-docs.deepseek.com/guides/thinking_mode
- https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/encoding/README.md
"""

import re

from sololab.core.llm.provider_base import ProviderQuirks
from sololab.core.llm.provider_registry import register_provider
from sololab.core.llm.providers.openai_compatible import OpenAICompatibleProvider

# 兼容 ASCII | 与全角 ｜ 两种竖线变体
_DSML_BLOCK_RE = re.compile(
    r"<[\|｜]\s*DSML\s*[\|｜][^>]*>.*?<\/[\|｜]\s*DSML\s*[\|｜][^>]*>",
    re.DOTALL,
)
_DSML_TAG_RE = re.compile(r"<\/?[\|｜]\s*DSML\s*[\|｜][^>]*>")


@register_provider
class DeepSeekProvider(OpenAICompatibleProvider):
    name = "deepseek"
    quirks = ProviderQuirks(
        name="deepseek",
        supports_thinking=True,
        requires_reasoning_passback=True,
        strip_dsml=True,
    )

    def _post_process_content(self, content: str) -> str:
        """剥离 DSML 标记块（DeepSeek V4 偶发泄漏）。

        注意：流式模式下本方法在每个 content delta 上调用，单 delta 通常
        不含完整 `<|DSML|...>...</|DSML|...>` 闭合块，但部分单 token 标签
        如 `<|DSML|>` 单独到达时也会被剥掉。聚合后的 _aggregate 输出再做一次
        block 级剥离作为兜底。
        """
        if not self.quirks.strip_dsml:
            return content
        # 先剥块再剥孤立标签（顺序重要）
        cleaned = _DSML_BLOCK_RE.sub("", content)
        cleaned = _DSML_TAG_RE.sub("", cleaned)
        return cleaned
