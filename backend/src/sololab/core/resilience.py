"""错误处理与韧性 - 重试、降级、校验、阈值控制。"""

import asyncio
import functools
import logging
from typing import Any, Callable, Dict, List, Optional, Type, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T")


class RetryConfig(BaseModel):
    """重试配置。"""

    max_retries: int = 3
    backoff_base: float = 2.0
    max_backoff: float = 30.0
    retry_on: List[str] = ["RateLimitError", "APIConnectionError", "Timeout"]


class FallbackChain:
    """LLM 模型降级链。

    当主模型失败时，按顺序尝试备选模型。
    """

    def __init__(
        self,
        models: List[str],
        retry_config: Optional[RetryConfig] = None,
    ) -> None:
        self.models = models
        self.config = retry_config or RetryConfig()

    async def execute(
        self, llm_gateway: Any, messages: List[Dict], **kwargs
    ) -> Dict:
        """执行 LLM 调用，支持重试和模型降级。"""
        last_error = None

        for model_idx, model in enumerate(self.models):
            for attempt in range(self.config.max_retries):
                try:
                    result = await llm_gateway.generate(
                        messages=messages, model=model, **kwargs
                    )
                    if model_idx > 0:
                        logger.info("降级到模型 %s 成功", model)
                    return result
                except Exception as e:
                    last_error = e
                    error_type = type(e).__name__
                    logger.warning(
                        "模型 %s 调用失败 (尝试 %d/%d): %s: %s",
                        model, attempt + 1, self.config.max_retries, error_type, str(e)[:200],
                    )
                    if attempt < self.config.max_retries - 1:
                        backoff = min(
                            self.config.backoff_base ** attempt,
                            self.config.max_backoff,
                        )
                        await asyncio.sleep(backoff)

            logger.warning("模型 %s 所有重试已耗尽，尝试降级", model)

        raise RuntimeError(f"All models failed. Last error: {last_error}")


def with_retry(
    max_retries: int = 3,
    backoff_base: float = 2.0,
    exceptions: tuple = (Exception,),
):
    """重试装饰器，适用于外部 API 调用。"""

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_error = e
                    if attempt < max_retries:
                        backoff = min(backoff_base ** attempt, 30.0)
                        logger.warning(
                            "%s 失败 (尝试 %d/%d): %s, %.1fs 后重试",
                            func.__name__, attempt + 1, max_retries + 1, e, backoff,
                        )
                        await asyncio.sleep(backoff)
            raise RuntimeError(
                f"{func.__name__} failed after {max_retries + 1} attempts: {last_error}"
            ) from last_error

        return wrapper

    return decorator


def with_timeout(timeout_seconds: float = 10.0, default: Any = None):
    """超时装饰器，适用于外部 API 调用。

    超时后返回默认值而非抛出异常（优雅跳过）。
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await asyncio.wait_for(
                    func(*args, **kwargs), timeout=timeout_seconds
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "%s 超时 (%.1fs)，使用默认值", func.__name__, timeout_seconds
                )
                return default

        return wrapper

    return decorator


class OutputValidator:
    """智能体输出 Pydantic 校验器。

    使用 Pydantic 模型校验 LLM 输出的结构化数据。
    支持自动修复（重新调用 LLM）。
    """

    def __init__(self, llm_gateway: Any = None) -> None:
        self.llm = llm_gateway

    def validate(
        self, data: Any, schema: Type[BaseModel], strict: bool = False
    ) -> Optional[BaseModel]:
        """校验数据是否符合 Pydantic 模型。

        Args:
            data: 待校验的数据（dict 或 str）
            schema: Pydantic 模型类
            strict: 严格模式（失败时抛异常）

        Returns:
            校验通过的 Pydantic 实例，或 None
        """
        try:
            if isinstance(data, str):
                import json
                data = json.loads(data)
            return schema.model_validate(data)
        except (ValidationError, ValueError, TypeError) as e:
            if strict:
                raise
            logger.warning("输出校验失败: %s", e)
            return None

    async def validate_and_repair(
        self,
        data: Any,
        schema: Type[BaseModel],
        context: str = "",
    ) -> Optional[BaseModel]:
        """校验数据，失败时通过 LLM 自动修复。"""
        result = self.validate(data, schema)
        if result:
            return result

        if not self.llm:
            return None

        # 自动修复：请求 LLM 重新格式化
        import json

        schema_json = json.dumps(schema.model_json_schema(), indent=2)
        try:
            repair_result = await self.llm.generate(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a data formatter. Fix the following data to match "
                            "the required JSON schema. Output ONLY valid JSON."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Data to fix:\n{json.dumps(data) if isinstance(data, dict) else data}\n\n"
                            f"Required schema:\n{schema_json}\n\n"
                            f"Context: {context}"
                        ),
                    },
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            return self.validate(repair_result["content"], schema, strict=True)
        except Exception as e:
            logger.warning("自动修复失败: %s", e)
            return None


class MessageThreshold:
    """消息阈值控制器。

    当黑板消息数量超过阈值时，强制触发评估阶段。
    """

    def __init__(self, max_messages: int = 100) -> None:
        self.max_messages = max_messages

    def should_force_evaluate(self, message_count: int) -> bool:
        """检查是否应强制进入评估阶段。"""
        return message_count >= self.max_messages

    def get_warning_level(self, message_count: int) -> Optional[str]:
        """获取消息数量警告级别。"""
        ratio = message_count / self.max_messages
        if ratio >= 1.0:
            return "critical"
        if ratio >= 0.8:
            return "warning"
        if ratio >= 0.6:
            return "info"
        return None
