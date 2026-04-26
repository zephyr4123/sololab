"""OpenAI 兼容协议的通用实现 —— 90% provider 都能直接复用。

具体 provider 子类只需声明 `name` + `quirks`，并按需 override 行为：
- 改 _build_params 注入 extra_body / 调整温度
- 改 _post_process_content 处理输出（如 DSML 剥离）
- 改 _aggregate_extras 收集额外字段（如 reasoning_content / signature）

设计目标：父类承载流式与非流式两条主路径的 80% 代码，子类只表达差异。
"""

from __future__ import annotations

import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from openai import AsyncOpenAI

from sololab.core.llm.provider_base import (
    ChatChunk,
    ChatResponse,
    LLMProviderBase,
    ProviderQuirks,
)

logger = logging.getLogger(__name__)


class OpenAICompatibleProvider(LLMProviderBase):
    """OpenAI 兼容协议的通用 provider 基类。

    使用 `openai` SDK 的 AsyncOpenAI 客户端，依赖 base_url 适配各家提供商。
    流式与非流式都委派到父类 _build_params / _parse_response / _parse_stream，
    子类只 override 自家差异点。
    """

    # 兜底 quirks（子类应 override）
    name = "openai_compat"
    quirks = ProviderQuirks(name="openai_compat")

    def __init__(self, base_url: str, api_key: str, default_model: str, **kwargs: Any) -> None:
        super().__init__(base_url, api_key, default_model, **kwargs)
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    # ───────────────────────── chat (non-stream) ─────────────────────────────

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: Optional[List[Dict[str, Any]]] = None,
        response_format: Optional[Dict[str, Any]] = None,
        **opts: Any,
    ) -> ChatResponse:
        params = self._build_params(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            response_format=response_format,
            stream=False,
            **opts,
        )
        response = await self._client.chat.completions.create(**params)
        return self._parse_response(response, fallback_model=params["model"])

    # ───────────────────────── chat (stream) ──────────────────────────────────

    async def chat_stream(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: Optional[List[Dict[str, Any]]] = None,
        **opts: Any,
    ) -> AsyncGenerator[ChatChunk, None]:
        params = self._build_params(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            stream=True,
            **opts,
        )
        stream = await self._client.chat.completions.create(**params)
        async for chunk in self._parse_stream(stream, fallback_model=params["model"]):
            yield chunk

    # ───────────────────────── embeddings ─────────────────────────────────────

    async def embed(self, texts: List[str], *, model: Optional[str] = None) -> List[List[float]]:
        response = await self._client.embeddings.create(
            model=model or self._default_model,
            input=texts,
            encoding_format="float",
        )
        return [item.embedding for item in response.data]

    # ───────────────────────── helpers (extension points) ────────────────────

    def _build_params(
        self,
        *,
        messages: List[Dict[str, Any]],
        model: Optional[str],
        temperature: float,
        max_tokens: int,
        tools: Optional[List[Dict[str, Any]]],
        stream: bool,
        response_format: Optional[Dict[str, Any]] = None,
        **opts: Any,
    ) -> Dict[str, Any]:
        """构造 OpenAI SDK 参数字典。

        子类可 override 以注入 extra_body / 调温度上限 / 加 headers 等。
        """
        # 应用 temperature 上限（如 Anthropic 兼容层 ≤ 1.0）
        if self.quirks.temperature_max is not None:
            temperature = min(temperature, self.quirks.temperature_max)

        params: Dict[str, Any] = {
            "model": model or self._default_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            params["tools"] = tools
        if response_format:
            params["response_format"] = response_format
        if stream:
            params["stream"] = True

        # 思考模式参数（quirks 声明 → extra_body 注入）
        if self.quirks.thinking_param is not None:
            params.setdefault("extra_body", {}).update(self.quirks.thinking_param)

        # 调用方透传的额外参数（覆盖默认）
        for k, v in opts.items():
            if v is not None:
                params[k] = v
        return params

    def _post_process_content(self, content: str) -> str:
        """对 content 字段做 provider 级清洗（如 DSML 剥离）。子类可 override。"""
        return content

    def _aggregate_assistant_extras(self, message: Any) -> Dict[str, Any]:
        """从 OpenAI SDK message 中收集 provider 扩展字段（reasoning_content 等）。

        默认实现：取 model_extra 里所有非 None 的字段。子类按需收紧/扩展。
        """
        extra = getattr(message, "model_extra", None) or {}
        return {k: v for k, v in extra.items() if v is not None}

    # ───────────────────────── response parsing ──────────────────────────────

    def _parse_response(self, response: Any, *, fallback_model: str) -> ChatResponse:
        message = response.choices[0].message
        content = self._post_process_content(message.content or "")

        tool_calls: Optional[List[Dict[str, Any]]] = None
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

        # 构造 raw_assistant_message —— 多轮工具调用时原样回传
        raw: Dict[str, Any] = {"role": "assistant", "content": message.content or None}
        if message.tool_calls:
            raw["tool_calls"] = [tc.model_dump(exclude_none=True) for tc in message.tool_calls]
        # 透传 provider 扩展字段（DeepSeek thinking 强制要求 reasoning_content 回传）
        for k, v in self._aggregate_assistant_extras(message).items():
            raw.setdefault(k, v)

        reasoning_content = raw.get("reasoning_content", "") or ""
        finish_reason = response.choices[0].finish_reason
        prompt_tok = response.usage.prompt_tokens if response.usage else 0
        completion_tok = response.usage.completion_tokens if response.usage else 0
        model_used = response.model or fallback_model

        return ChatResponse(
            content=content,
            reasoning_content=reasoning_content,
            tool_calls=tool_calls,
            raw_assistant_message=raw,
            finish_reason=finish_reason,
            model=model_used,
            usage={
                "prompt_tokens": prompt_tok,
                "completion_tokens": completion_tok,
                "cost_usd": 0.0,  # 由 CostTrackingProvider 填充
            },
        )

    # ───────────────────────── stream parsing ────────────────────────────────

    async def _parse_stream(
        self, stream: Any, *, fallback_model: str
    ) -> AsyncGenerator[ChatChunk, None]:
        """解析 OpenAI 兼容流，yield ChatChunk 序列，最后一条为 type='done'。"""
        full_content = ""
        full_reasoning = ""
        # tool_calls 增量聚合：index → {id, name, arguments}
        tool_calls_state: Dict[int, Dict[str, Any]] = {}
        finish_reason: Optional[str] = None
        usage_obj = None
        final_model = fallback_model

        async for chunk in stream:
            if getattr(chunk, "usage", None):
                usage_obj = chunk.usage
            if getattr(chunk, "model", None):
                final_model = chunk.model
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            delta = choice.delta
            if choice.finish_reason:
                finish_reason = choice.finish_reason

            # reasoning_content 增量
            reasoning = getattr(delta, "reasoning_content", None)
            if reasoning:
                full_reasoning += reasoning
                yield ChatChunk(type="reasoning", delta=reasoning)

            # content 增量（带 provider 级 post-process，逐 token 应用）
            if delta.content:
                processed = self._post_process_content(delta.content)
                if processed:
                    full_content += processed
                    yield ChatChunk(type="content", delta=processed)

            # tool_calls 增量
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index if tc.index is not None else 0
                    state = tool_calls_state.setdefault(
                        idx, {"id": None, "name": None, "arguments": ""}
                    )
                    if tc.id:
                        state["id"] = tc.id
                    fn = getattr(tc, "function", None)
                    if fn:
                        if fn.name:
                            state["name"] = fn.name
                            yield ChatChunk(
                                type="tool_call_init",
                                index=idx,
                                tool_call_id=state["id"],
                                tool_call_name=state["name"],
                            )
                        if fn.arguments:
                            state["arguments"] += fn.arguments
                            yield ChatChunk(
                                type="tool_call_arg_delta",
                                index=idx,
                                delta=fn.arguments,
                            )

        # 聚合最终 tool_calls
        final_tool_calls: Optional[List[Dict[str, Any]]] = None
        if tool_calls_state:
            final_tool_calls = [
                {
                    "id": s["id"],
                    "function": {"name": s["name"], "arguments": s["arguments"]},
                }
                for _, s in sorted(tool_calls_state.items())
            ]

        raw: Dict[str, Any] = {
            "role": "assistant",
            "content": full_content or None,
        }
        if final_tool_calls:
            raw["tool_calls"] = [
                {"id": tc["id"], "type": "function", "function": tc["function"]}
                for tc in final_tool_calls
            ]
        if full_reasoning:
            raw["reasoning_content"] = full_reasoning

        prompt_tok = usage_obj.prompt_tokens if usage_obj else 0
        completion_tok = usage_obj.completion_tokens if usage_obj else 0

        yield ChatChunk(
            type="done",
            final=ChatResponse(
                content=full_content,
                reasoning_content=full_reasoning,
                tool_calls=final_tool_calls,
                raw_assistant_message=raw,
                finish_reason=finish_reason,
                model=final_model,
                usage={
                    "prompt_tokens": prompt_tok,
                    "completion_tokens": completion_tok,
                    "cost_usd": 0.0,
                },
            ),
        )
