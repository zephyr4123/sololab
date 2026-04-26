"""LLM 网关 —— Provider Strategy + Factory + Registry 的薄路由层。

职责：
- 根据 LLMConfig 决定 chat / embed provider（自动检测 + 显式指定双轨）
- 委派 chat / chat_stream / embed 调用到对应 provider
- 透明叠加 CostTrackingProvider，自动计费
- 保持 18 处调用点 API 兼容（generate / generate_stream / stream / embed 旧签名）

实际能力（reasoning_content 透传、DSML 剥离、temperature cap、流式聚合）
全部下沉到 sololab.core.llm.providers.* 各 provider 实现，本文件只负责调度。

新增 provider 的步骤：
1. 在 sololab/core/llm/providers/ 写一个继承 OpenAICompatibleProvider 的类
2. 加 @register_provider 装饰，声明 name + ProviderQuirks
3. 在 providers/__init__.py 导入它（触发自动注册）
"""

from __future__ import annotations

import logging
from typing import AsyncGenerator, Dict, List, Optional

from pydantic import BaseModel

from sololab.core.llm import (
    CostTrackingProvider,
    LLMProviderBase,
    PricingTable,
    ProviderRegistry,
)

logger = logging.getLogger(__name__)


class LLMConfig(BaseModel):
    """LLM 网关配置（OpenAI 兼容格式 + Provider 选择）。"""

    base_url: str = "https://api.openai.com/v1"
    api_key: str = "sk-xxx"
    default_model: str = "gpt-4o"
    # 显式 provider 名（覆盖 base_url 自动检测）；留空则按 URL 推断
    provider: Optional[str] = None

    # Embedding 独立配置
    embedding_base_url: str = "https://api.openai.com/v1"
    embedding_api_key: str = "sk-xxx"
    embedding_model: str = "text-embedding-3-small"
    embedding_provider: Optional[str] = None

    # 兼容字段（不再使用，保留避免 pydantic 报错）
    fallback_chain: List[str] = []
    budget_limit_usd: Optional[float] = 50.0
    cache_enabled: bool = False


class LLMGateway:
    """LLM 路由网关。

    构造时根据 base_url 自动推断 provider，也可通过 config.provider 显式指定。
    所有公开方法保持与重构前一致，确保 18 处调用点零改动。
    """

    def __init__(self, config: LLMConfig) -> None:
        self.config = config
        self._pricing = PricingTable.load_default()

        # 选择并实例化 chat provider，外覆 CostTrackingProvider
        chat_name = config.provider or ProviderRegistry.detect_from_url(config.base_url)
        chat_inner = ProviderRegistry.create(
            chat_name,
            base_url=config.base_url,
            api_key=config.api_key,
            default_model=config.default_model,
        )
        self._chat: LLMProviderBase = CostTrackingProvider(chat_inner, pricing=self._pricing)

        # Embedding provider（可与 chat 不同提供商）
        embed_name = config.embedding_provider or ProviderRegistry.detect_from_url(
            config.embedding_base_url
        )
        embed_inner = ProviderRegistry.create(
            embed_name,
            base_url=config.embedding_base_url,
            api_key=config.embedding_api_key,
            default_model=config.embedding_model,
        )
        self._embed: LLMProviderBase = CostTrackingProvider(embed_inner, pricing=self._pricing)

        if config.fallback_chain:
            logger.warning(
                "fallback_chain 已被弃用 (provider 抽象后不再支持中途切模型)，传入的 %d "
                "个备选模型已忽略",
                len(config.fallback_chain),
            )

        logger.info(
            "LLMGateway initialized: chat=%s (%s, model=%s), embed=%s (%s, model=%s)",
            chat_name,
            config.base_url,
            config.default_model,
            embed_name,
            config.embedding_base_url,
            config.embedding_model,
        )

    # ──────────────────── 旧 API 兼容（dict 形态） ───────────────────────────

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
        """同步生成 —— 委派至 chat provider，返回旧风格 dict。"""
        resp = await self._chat.chat(
            messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            response_format=response_format,
            **kwargs,
        )
        return {
            "content": resp.content,
            "model": resp.model,
            "tool_calls": resp.tool_calls,
            "raw_assistant_message": resp.raw_assistant_message,
            "usage": resp.usage,
        }

    async def generate_stream(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: Optional[List[Dict]] = None,
        **kwargs,
    ) -> AsyncGenerator[dict, None]:
        """流式生成 —— 委派至 chat provider，转换 ChatChunk 为旧风格 dict。

        Yields 与旧 API 相同的 dict：
          {"type": "reasoning",          "delta": str}
          {"type": "content",            "delta": str}
          {"type": "tool_call_init",     "index": int, "id": str, "name": str}
          {"type": "tool_call_arg_delta","index": int, "delta": str}
          {"type": "done", "content"/"reasoning_content"/"tool_calls"/
                           "raw_assistant_message"/"finish_reason"/"model"/"usage": ...}
        """
        async for chunk in self._chat.chat_stream(
            messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            **kwargs,
        ):
            if chunk.type == "reasoning":
                yield {"type": "reasoning", "delta": chunk.delta}
            elif chunk.type == "content":
                yield {"type": "content", "delta": chunk.delta}
            elif chunk.type == "tool_call_init":
                yield {
                    "type": "tool_call_init",
                    "index": chunk.index,
                    "id": chunk.tool_call_id,
                    "name": chunk.tool_call_name,
                }
            elif chunk.type == "tool_call_arg_delta":
                yield {
                    "type": "tool_call_arg_delta",
                    "index": chunk.index,
                    "delta": chunk.delta,
                }
            elif chunk.type == "done":
                final = chunk.final
                if final is None:
                    yield {"type": "done", "content": "", "tool_calls": None, "usage": {}}
                    continue
                yield {
                    "type": "done",
                    "content": final.content,
                    "reasoning_content": final.reasoning_content,
                    "tool_calls": final.tool_calls,
                    "raw_assistant_message": final.raw_assistant_message,
                    "finish_reason": final.finish_reason,
                    "model": final.model,
                    "usage": final.usage,
                }

    async def stream(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        **kwargs,
    ) -> AsyncGenerator[str, None]:
        """简易流式（仅 content delta，向后兼容 WriterAI 用）。"""
        async for chunk in self._chat.chat_stream(
            messages, model=model, temperature=temperature, **kwargs
        ):
            if chunk.type == "content" and chunk.delta:
                yield chunk.delta

    async def embed(
        self, texts: List[str], model: Optional[str] = None
    ) -> List[List[float]]:
        return await self._embed.embed(texts, model=model)

    # ──────────────────── 调试/反射接口 ─────────────────────────────────────

    @property
    def chat_provider_name(self) -> str:
        return self._chat.name

    @property
    def embed_provider_name(self) -> str:
        return self._embed.name
