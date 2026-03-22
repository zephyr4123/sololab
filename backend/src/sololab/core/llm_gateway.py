"""LLM 网关 - 基于 LiteLLM 的轻量封装，提供统一模型访问。"""

from typing import AsyncGenerator, Dict, List, Optional

import litellm
from litellm import acompletion, aembedding
from pydantic import BaseModel


class LLMConfig(BaseModel):
    """LLM 配置（OpenAI 兼容格式）。"""

    base_url: str = "https://api.openai.com/v1"
    api_key: str = "sk-xxx"
    default_model: str = "gpt-4o"
    fallback_chain: List[str] = ["openai/deepseek-chat", "openai/gpt-4o-mini"]
    budget_limit_usd: Optional[float] = 50.0
    cache_enabled: bool = True

    # Embedding 独立配置（可使用不同提供商）
    embedding_base_url: str = "https://api.openai.com/v1"
    embedding_api_key: str = "sk-xxx"
    embedding_model: str = "text-embedding-3-small"


class LLMGateway:
    """LiteLLM 轻量封装层。
    - 统一通过 OpenAI 兼容代理调用所有模型
    - 内置降级 / 重试 / 费用追踪
    """

    def __init__(self, config: LLMConfig) -> None:
        self.config = config

        if config.cache_enabled:
            litellm.cache = litellm.Cache(type="redis", host="redis", port=6379)

        litellm.set_verbose = False

    def _model_name(self, model: Optional[str] = None) -> str:
        """构建 LiteLLM 模型标识（openai/<model>）。"""
        model = model or self.config.default_model
        if "/" not in model:
            return f"openai/{model}"
        return model

    def _api_params(self) -> dict:
        """返回统一的 API 连接参数。"""
        return {
            "api_key": self.config.api_key,
            "api_base": self.config.base_url,
        }

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
        try:
            response = await acompletion(
                model=self._model_name(model),
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format=response_format,
                fallbacks=self.config.fallback_chain,
                **self._api_params(),
                **kwargs,
            )
            # 费用计算：代理转发的模型名可能不在 LiteLLM 价格表中，容错处理
            try:
                cost_usd = litellm.completion_cost(response)
            except Exception:
                cost_usd = 0.0

            return {
                "content": response.choices[0].message.content,
                "model": response.model,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "cost_usd": cost_usd,
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
        response = await acompletion(
            model=self._model_name(model),
            messages=messages,
            temperature=temperature,
            stream=True,
            fallbacks=self.config.fallback_chain,
            **self._api_params(),
            **kwargs,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def embed(
        self, texts: List[str], model: Optional[str] = None
    ) -> List[List[float]]:
        """统一向量嵌入接口（使用独立的 Embedding 提供商配置）。"""
        embed_model = self._model_name(model or self.config.embedding_model)
        response = await aembedding(
            model=embed_model,
            input=texts,
            api_key=self.config.embedding_api_key,
            api_base=self.config.embedding_base_url,
            encoding_format="float",
        )
        return [item["embedding"] for item in response.data]
