"""LLM 网关 - 基于 OpenAI SDK 的轻量封装，通过 OpenAI 兼容 API 访问所有模型。"""

import logging
from typing import AsyncGenerator, Dict, List, Optional

from openai import AsyncOpenAI
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class LLMConfig(BaseModel):
    """LLM 配置（OpenAI 兼容格式）。"""

    base_url: str = "https://api.openai.com/v1"
    api_key: str = "sk-xxx"
    default_model: str = "gpt-4o"
    fallback_chain: List[str] = []
    budget_limit_usd: Optional[float] = 50.0
    cache_enabled: bool = False

    # Embedding 独立配置（可使用不同提供商）
    embedding_base_url: str = "https://api.openai.com/v1"
    embedding_api_key: str = "sk-xxx"
    embedding_model: str = "text-embedding-3-small"


class LLMGateway:
    """OpenAI 兼容 API 轻量封装层。

    直接使用 openai SDK 的 AsyncOpenAI 客户端，
    通过 base_url 适配任何 OpenAI 兼容的 API 提供商
    （阿里云通义、DeepSeek、Gemini、Ollama 等）。
    """

    def __init__(self, config: LLMConfig) -> None:
        self.config = config
        # LLM 客户端
        self._client = AsyncOpenAI(
            api_key=config.api_key,
            base_url=config.base_url,
        )
        # Embedding 客户端（可能使用不同的提供商）
        self._embed_client = AsyncOpenAI(
            api_key=config.embedding_api_key,
            base_url=config.embedding_base_url,
        )

    async def generate(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict] = None,
        **kwargs,
    ) -> dict:
        """生成接口，支持手动降级。"""
        use_model = model or self.config.default_model

        # 尝试主模型 + fallback chain
        models_to_try = [use_model] + [
            m for m in self.config.fallback_chain if m != use_model
        ]

        last_error = None
        for m in models_to_try:
            try:
                params: dict = {
                    "model": m,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }
                if response_format:
                    params["response_format"] = response_format

                response = await self._client.chat.completions.create(**params)

                return {
                    "content": response.choices[0].message.content,
                    "model": response.model,
                    "usage": {
                        "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                        "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                        "cost_usd": 0.0,  # OpenAI SDK 不提供费用，由 CostTracker 单独追踪
                    },
                }
            except Exception as e:
                last_error = e
                logger.warning("模型 %s 调用失败: %s, 尝试降级", m, str(e)[:200])
                continue

        raise RuntimeError(f"All models failed: {last_error}") from last_error

    async def stream(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        **kwargs,
    ) -> AsyncGenerator[str, None]:
        """流式生成。"""
        use_model = model or self.config.default_model

        stream = await self._client.chat.completions.create(
            model=use_model,
            messages=messages,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def embed(
        self, texts: List[str], model: Optional[str] = None
    ) -> List[List[float]]:
        """向量嵌入接口（使用独立的 Embedding 提供商配置）。"""
        embed_model = model or self.config.embedding_model

        response = await self._embed_client.embeddings.create(
            model=embed_model,
            input=texts,
            encoding_format="float",
        )
        return [item.embedding for item in response.data]
