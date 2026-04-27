"""Phase 抽象基类 + 共享上下文容器。

设计原则：
- Phase 是策略对象（Strategy），各阶段算法独立可替换
- PhaseContext 是流转数据 + 依赖注入的单一容器，phase 间通过它解耦
- 每个 phase 自己 yield 入场 status 事件 + 内部增量事件，无需上层包装
- cancel_event 由 phase 在合适粒度自检（不是只靠 phase 边界）
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

from sololab.core.llm_gateway import LLMGateway
from sololab.core.tool_registry import ToolRegistry
from sololab.models.agent import AgentState, Message


@dataclass
class PhaseContext:
    """跨 phase 共享的状态容器。

    输入字段（pipeline 启动时填充）：
        current_input    : 本轮输入主题（多轮时会被 _refine_prompt 改写）
        original_topic   : 用户原始主题，agent 锚定用
        doc_context      : 文档上下文（参考文献摘要）
        history_seed_ideas: 上一轮的种子创意（多轮对话用）
        is_continuation  : 是否延续对话
        cancel_event     : 取消信号
        max_rounds / top_k : 流程参数
        round            : 当前轮数（pipeline 维护）

    流转字段（各 phase 写自己的，每轮 reset）：
        ideas            : separate 输出
        idea_groups      : cluster 输出（默认管线已不用，custom pipeline 用）
        refined_ideas    : together 输出
        synthesized      : synthesize 输出
        top_ideas        : tournament 输出
        elo_scores       : tournament 内部用，每轮 reset

    跨轮持久字段：
        history_seed_ideas: 上一轮 top_ideas（喂给下一轮 separate）
        is_continuation   : 是否延续（round 2+ 自动 True）
        agent_states      : per-agent 运行状态（cost 累加用）

    依赖注入：
        llm / tools
    """

    # 输入
    current_input: str
    original_topic: str
    doc_context: str
    history_seed_ideas: List[Message]
    is_continuation: bool
    cancel_event: Optional[asyncio.Event]
    max_rounds: int
    top_k: int
    # pipeline 维护
    round: int = 1
    # 流转（每轮 reset）
    ideas: List[Message] = field(default_factory=list)
    idea_groups: List[List[Message]] = field(default_factory=list)
    refined_ideas: List[Message] = field(default_factory=list)
    synthesized: List[Message] = field(default_factory=list)
    top_ideas: List[Message] = field(default_factory=list)
    elo_scores: Dict[str, float] = field(default_factory=dict)
    # 跨轮持久
    agent_states: Dict[str, AgentState] = field(default_factory=dict)
    # 依赖
    llm: Optional[LLMGateway] = None
    tools: Optional[ToolRegistry] = None

    def is_cancelled(self) -> bool:
        return self.cancel_event is not None and self.cancel_event.is_set()


# Phase yield 的事件类型：dict（业务事件）或 Message（流转数据）
PhaseEvent = Union[Dict[str, Any], Message]


class Phase(ABC):
    """单个流程阶段（Strategy 接口）。

    每个 Phase 子类应：
    - 声明 `name` (类属性)
    - 实现 `run(ctx)` 异步生成器，yield 状态事件 + 业务事件 + Message 对象
    - 自己写入 ctx 的对应输出字段（如 ctx.ideas）
    - 在合适粒度内自检 ctx.is_cancelled()
    """

    name: str

    @abstractmethod
    def run(self, ctx: PhaseContext) -> AsyncGenerator[PhaseEvent, None]:
        """执行该阶段。yield 的 dict 直接进 SSE，Message 对象由 phase 写入 ctx 对应字段。"""
