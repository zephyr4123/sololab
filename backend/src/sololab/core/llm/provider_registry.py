"""Provider 注册中心 —— Factory Method + Registry 模式。

使用方式（自动注册）：
    @register_provider
    class DeepSeekProvider(LLMProviderBase):
        name = "deepseek"
        quirks = ProviderQuirks(...)

构造时：
    provider = ProviderRegistry.create(
        name="deepseek",
        base_url="https://api.deepseek.com",
        api_key="sk-xxx",
        default_model="deepseek-v4-flash",
    )

或自动检测：
    name = ProviderRegistry.detect_from_url(base_url)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Type
from urllib.parse import urlparse

from sololab.core.llm.provider_base import LLMProviderBase

logger = logging.getLogger(__name__)


class ProviderRegistry:
    """LLM Provider 注册中心（类级单例，全进程共享）。"""

    _providers: Dict[str, Type[LLMProviderBase]] = {}

    @classmethod
    def register(cls, provider_cls: Type[LLMProviderBase]) -> Type[LLMProviderBase]:
        """注册一个 provider 类，返回原类以支持装饰器用法。

        若类未声明 `name` 属性则报错。重复注册同名 provider 会覆盖（带 warning）。
        """
        name = getattr(provider_cls, "name", None)
        if not name:
            raise ValueError(
                f"Provider class {provider_cls.__name__} must declare a `name` class attribute"
            )
        if name in cls._providers and cls._providers[name] is not provider_cls:
            logger.warning("Provider '%s' 已存在，被 %s 覆盖", name, provider_cls.__name__)
        cls._providers[name] = provider_cls
        return provider_cls

    @classmethod
    def get_class(cls, name: str) -> Type[LLMProviderBase]:
        """按 name 取 provider 类。"""
        if name not in cls._providers:
            raise ValueError(
                f"Unknown provider '{name}'. Registered: {sorted(cls._providers.keys())}"
            )
        return cls._providers[name]

    @classmethod
    def create(
        cls,
        name: str,
        base_url: str,
        api_key: str,
        default_model: str,
        **kwargs: Any,
    ) -> LLMProviderBase:
        """按 name 实例化 provider。"""
        provider_cls = cls.get_class(name)
        return provider_cls(
            base_url=base_url,
            api_key=api_key,
            default_model=default_model,
            **kwargs,
        )

    @classmethod
    def list_providers(cls) -> List[str]:
        """列出所有已注册 provider 名。"""
        return sorted(cls._providers.keys())

    @classmethod
    def detect_from_url(cls, base_url: str) -> str:
        """根据 base_url 域名推断 provider 名（best-effort）。

        命中规则：
            *.deepseek.com           → deepseek
            *.anthropic.com          → anthropic
            *.openai.com             → openai
            *.aliyuncs.com / dashscope → qwen
            其他                      → openai_compat (兜底走 OpenAI 兼容协议)
        """
        host = (urlparse(base_url).netloc or base_url).lower()
        if "deepseek.com" in host:
            return "deepseek"
        if "anthropic.com" in host:
            return "anthropic"
        if "openai.com" in host:
            return "openai"
        if "aliyuncs.com" in host or "dashscope" in host:
            return "qwen"
        return "openai_compat"


def register_provider(provider_cls: Type[LLMProviderBase]) -> Type[LLMProviderBase]:
    """装饰器形式注册 provider。"""
    return ProviderRegistry.register(provider_cls)
