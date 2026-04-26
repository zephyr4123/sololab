"""具体 Provider 实现 —— 导入即触发自动注册到 ProviderRegistry。

新增 provider 步骤：
1. 在本目录新建 xxx_provider.py，类继承 OpenAICompatibleProvider 并 @register_provider
2. 把模块名加到下方 import 列表（让自动注册生效）
"""

# 顺序：先 base 再具体，避免循环导入
from sololab.core.llm.providers.openai_compatible import OpenAICompatibleProvider  # noqa: F401
from sololab.core.llm.providers.openai_provider import (  # noqa: F401
    OpenAICompatProvider,
    OpenAIProvider,
)
from sololab.core.llm.providers.deepseek_provider import DeepSeekProvider  # noqa: F401
from sololab.core.llm.providers.anthropic_provider import AnthropicProvider  # noqa: F401
from sololab.core.llm.providers.qwen_provider import QwenProvider  # noqa: F401
