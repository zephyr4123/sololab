"""LLM 网关 - 基于 LiteLLM 的轻量封装，提供统一模型访问。"""

from typing import AsyncGenerator, Dict, List, Optional

import litellm
from litellm import acompletion, aembedding
from pydantic import BaseModel


class LLMConfig(BaseModel):
    """全局 LLM 配置。"""

    fallback_chain: List[str] = ["deepseek/deepseek-chat", "openai/gpt-4o-mini"]
    default_model: str = "openai/gpt-4o"
    budget_limit_usd: Optional[float] = 50.0
    cache_enabled: bool = True


class LLMGateway:
    """LiteLLM 轻量封装层。
    - 统一 100+ 模型调用为 OpenAI 格式
    - 内置降级 / 重试 / 费用追踪
    """

    def __init__(self, config: LLMConfig) -> None:
        self.config = config

        if config.cache_enabled:
            litellm.cache = litellm.Cache(type="redis", host="redis", port=6379)

        litellm.set_verbose = False

    async def generate(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict] = None,
        **kwargs,
    ) -> dict:
        """统一生成接口，支持自动降级。"""
        model = model or self.config.default_model
        try:
            response = await acompletion(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format=response_format,
                fallbacks=self.config.fallback_chain,
                **kwargs,
            )
            return {
                "content": response.choices[0].message.content,
                "model": response.model,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "cost_usd": litellm.completion_cost(response),
                },
            }
        except Exception as e:
            raise RuntimeError(f"All LLM providers failed: {e}") from e

    async def stream(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        **kwargs,
    ) -> AsyncGenerator[str, None]:
        """流式生成。"""
        model = model or self.config.default_model
        response = await acompletion(
            model=model,
            messages=messages,
            temperature=temperature,
            stream=True,
            fallbacks=self.config.fallback_chain,
            **kwargs,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def embed(
        self, texts: List[str], model: str = "openai/text-embedding-3-small"
    ) -> List[List[float]]:
        """统一向量嵌入接口。"""
        response = await aembedding(model=model, input=texts)
        return [item["embedding"] for item in response.data]
