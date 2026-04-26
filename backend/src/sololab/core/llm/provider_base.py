"""LLM Provider 抽象基类与值类型。

设计原则：
- LLMProviderBase 是策略接口，每个具体 provider 实现自家怪癖
- ProviderQuirks 把 provider 的能力声明为数据，让上层做 capability-aware 处理
- ChatResponse / ChatChunk 是 provider-agnostic 的统一返回值
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, ClassVar, Dict, List, Optional


@dataclass
class ProviderQuirks:
    """Provider 行为声明 —— 上层根据这些字段决定如何与该 provider 交互。"""

    name: str
    # 是否支持思考模式（reasoning_content / thinking）
    supports_thinking: bool = False
    # 多轮对话时上一轮 reasoning_content 是否必须原样回传
    # （DeepSeek thinking 模式硬要求，否则报 400）
    requires_reasoning_passback: bool = False
    # temperature 上限（None 表示不裁剪），Anthropic 兼容层为 1.0
    temperature_max: Optional[float] = None
    # 是否需要剥离 DSML tool-call 标记（DeepSeek V4 偶发泄漏）
    strip_dsml: bool = False
    # 思考模式参数模板（写入 extra_body），None 表示 provider 自行处理或无关
    thinking_param: Optional[Dict[str, Any]] = None


@dataclass
class ChatResponse:
    """非流式生成的统一返回值（provider-agnostic）。"""

    content: str
    reasoning_content: str = ""
    tool_calls: Optional[List[Dict[str, Any]]] = None
    # 完整 assistant message 字典（含 reasoning_content / 扩展字段），多轮时原样回传
    raw_assistant_message: Dict[str, Any] = field(default_factory=dict)
    finish_reason: Optional[str] = None
    model: str = ""
    # {"prompt_tokens": int, "completion_tokens": int, "cost_usd": float}
    usage: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ChatChunk:
    """流式生成的单个增量事件。

    type 枚举：
      - "reasoning"          : 思考增量（delta 为字符串）
      - "content"            : 正文增量（delta 为字符串）
      - "tool_call_init"     : 新工具调用开始（index/id/name 有效）
      - "tool_call_arg_delta": 工具参数 JSON 增量片段（index/delta 有效）
      - "done"               : 流结束，final 为聚合好的 ChatResponse
    """

    type: str
    delta: str = ""
    index: Optional[int] = None
    tool_call_id: Optional[str] = None
    tool_call_name: Optional[str] = None
    final: Optional[ChatResponse] = None


class LLMProviderBase(ABC):
    """LLM Provider 抽象基类（Strategy 模式）。

    具体子类需声明 `name` 与 `quirks` 类属性，并实现 chat / chat_stream / embed。

    构造参数语义：
    - base_url: API 端点（OpenAI 兼容风格）
    - api_key:  鉴权密钥
    - default_model: 默认模型 ID（每次调用可覆盖）
    """

    name: ClassVar[str]
    quirks: ClassVar[ProviderQuirks]

    def __init__(
        self,
        base_url: str,
        api_key: str,
        default_model: str,
        **kwargs: Any,
    ) -> None:
        self._base_url = base_url
        self._api_key = api_key
        self._default_model = default_model
        self._extra_init = kwargs

    @property
    def default_model(self) -> str:
        return self._default_model

    @abstractmethod
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
        """同步生成（一次性返回完整结果）。"""

    @abstractmethod
    def chat_stream(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: Optional[List[Dict[str, Any]]] = None,
        **opts: Any,
    ) -> AsyncGenerator[ChatChunk, None]:
        """流式生成（逐 token yield ChatChunk，最后一条 type='done'）。"""

    @abstractmethod
    async def embed(
        self,
        texts: List[str],
        *,
        model: Optional[str] = None,
    ) -> List[List[float]]:
        """向量嵌入。"""
