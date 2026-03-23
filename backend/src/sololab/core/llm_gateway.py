"""LLM 网关 - 基于 OpenAI SDK 的轻量封装，通过 OpenAI 兼容 API 访问所有模型。"""

import logging
from typing import AsyncGenerator, Dict, List, Optional

from openai import AsyncOpenAI
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# 模型定价表：每百万 token 的美元价格 (prompt, completion)
# 不在表中的模型按 0 计费（避免报错），日志会提示缺失
MODEL_PRICING: Dict[str, tuple[float, float]] = {
    # OpenAI
    "gpt-4o": (2.5, 10.0),
    "gpt-4o-2024-11-20": (2.5, 10.0),
    "gpt-4o-2024-08-06": (2.5, 10.0),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o-mini-2024-07-18": (0.15, 0.60),
    "gpt-4-turbo": (10.0, 30.0),
    "gpt-4": (30.0, 60.0),
    "gpt-3.5-turbo": (0.5, 1.5),
    "o1": (15.0, 60.0),
    "o1-mini": (3.0, 12.0),
    "o3-mini": (1.1, 4.4),
    # Anthropic (通过兼容 API)
    "claude-sonnet-4-20250514": (3.0, 15.0),
    "claude-3-5-sonnet-20241022": (3.0, 15.0),
    "claude-3-5-haiku-20241022": (0.8, 4.0),
    "claude-3-haiku-20240307": (0.25, 1.25),
    # DeepSeek
    "deepseek-chat": (0.27, 1.10),
    "deepseek-reasoner": (0.55, 2.19),
    # 阿里通义
    "qwen-plus": (0.80, 2.0),
    "qwen-turbo": (0.30, 0.60),
    "qwen-max": (2.40, 9.60),
    # Google Gemini (通过兼容 API)
    "gemini-2.0-flash": (0.10, 0.40),
    "gemini-2.5-flash-preview-05-20": (0.15, 0.60),
    "gemini-2.5-pro-preview-05-06": (1.25, 10.0),
    # OpenRouter 模型（带 provider 前缀）
    "google/gemini-3-flash-preview": (0.332, 3.0),
    "google/gemini-2.5-flash-preview": (0.15, 0.60),
    "google/gemini-2.5-pro-preview": (1.25, 10.0),
    # 嵌入模型（text-embedding-v4: 0.072 CNY/M ≈ 0.01 USD/M）
    "text-embedding-v4": (0.01, 0.0),
}


def _estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """根据模型定价表估算费用。"""
    # 精确匹配
    if model in MODEL_PRICING:
        prompt_price, completion_price = MODEL_PRICING[model]
    else:
        # 模糊匹配：model 名称可能包含版本后缀
        matched = None
        for key in MODEL_PRICING:
            if model.startswith(key) or key.startswith(model):
                matched = key
                break
        if matched:
            prompt_price, completion_price = MODEL_PRICING[matched]
        else:
            logger.warning("模型 %s 不在定价表中，费用按 0 计算", model)
            return 0.0

    return (prompt_tokens * prompt_price + completion_tokens * completion_price) / 1_000_000


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
        tools: Optional[List[Dict]] = None,
        **kwargs,
    ) -> dict:
        """生成接口，支持手动降级和原生 function calling。

        Args:
            tools: OpenAI function calling 格式的工具定义列表。
                   当 LLM 决定调用工具时，返回值中 tool_calls 非空。
        """
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
                if tools:
                    params["tools"] = tools

                response = await self._client.chat.completions.create(**params)

                prompt_tok = response.usage.prompt_tokens if response.usage else 0
                completion_tok = response.usage.completion_tokens if response.usage else 0
                cost = _estimate_cost(response.model or m, prompt_tok, completion_tok)

                message = response.choices[0].message

                # 提取 tool_calls（如果有）
                tool_calls = None
                if message.tool_calls:
                    tool_calls = [
                        {
                            "id": tc.id,
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in message.tool_calls
                    ]

                return {
                    "content": message.content or "",
                    "model": response.model,
                    "tool_calls": tool_calls,
                    "usage": {
                        "prompt_tokens": prompt_tok,
                        "completion_tokens": completion_tok,
                        "cost_usd": cost,
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
