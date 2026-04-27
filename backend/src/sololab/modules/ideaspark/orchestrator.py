"""IdeaSpark 流程编排 —— Pipeline 组合器（Strategy 模式）。

职责：
1. 构造 PhaseContext（注入依赖、初始化输入字段）
2. 按顺序驱动 phases 列表，分流 Message 与 dict 事件
3. 多轮之间把 top_ideas 喂给下一轮（history_seed_ideas + is_continuation 复用）

具体阶段算法全部下沉到 sololab.modules.ideaspark.phases.*。
新增/替换阶段只需改 self.phases 列表，无需触碰本类。

设计变更：
- 默认管线去掉 ClusterPhase（在 2-persona × 1-message 场景下永远是空架子）。
  custom pipeline 仍可显式 import ClusterPhase 注入。
- round 间不再用 _refine_prompt 改写 current_input —— 改成把 top_ideas 注入
  ctx.history_seed_ideas + 置 ctx.is_continuation=True，让 separate_phase 自己消费。
  好处：上一轮全文进 prompt（无 150 字截断），continuation_directive 自动启用。
- 删除 UUID-based 收敛检查（每轮新 UUID 永远不命中）。默认跑满 max_rounds，
  用户自己设 max_rounds=1 关掉多轮。
"""

from __future__ import annotations

import asyncio
import re
import uuid
from typing import Any, AsyncGenerator, List, Optional

from sololab.core.llm_gateway import LLMGateway
from sololab.core.tool_registry import ToolRegistry
from sololab.models.agent import Message, MessageType
from sololab.modules.ideaspark.phases import (
    Phase,
    PhaseContext,
    SeparatePhase,
    SynthesizePhase,
    TogetherPhase,
    TournamentPhase,
)


class Orchestrator:
    """IdeaSpark Pipeline 组合器。

    默认流水线：Separate → Together → Synthesize → Tournament
    （ClusterPhase 在固定 2-persona 场景下无意义，从默认管线移除）
    替换/新增 phase 通过构造参数注入即可。
    """

    DEFAULT_PHASES: List[Phase] = []  # 占位，__init__ 时动态填

    def __init__(
        self,
        llm_gateway: LLMGateway,
        tool_registry: Optional[ToolRegistry] = None,
        phases: Optional[List[Phase]] = None,
    ) -> None:
        self.llm = llm_gateway
        self.tools = tool_registry
        self.phases: List[Phase] = phases or [
            SeparatePhase(),
            TogetherPhase(iterations=2),
            SynthesizePhase(),
            TournamentPhase(num_pairs=10),
        ]

    async def run(
        self,
        user_input: str,
        max_rounds: int = 3,
        top_k: int = 5,
        doc_context: str = "",
        cancel_event: Optional[asyncio.Event] = None,
        history: Optional[list] = None,
    ) -> AsyncGenerator[Any, None]:
        """执行完整 IdeaSpark 流程，逐 token / phase 实时上吐事件。"""
        # 从历史中提取上一轮种子创意（多会话延续用）
        history_seed_ideas: List[Message] = []
        is_continuation = False
        if history and len(history) > 1:
            is_continuation = True
            history_seed_ideas = self._extract_seed_ideas_from_history(history)

        ctx = PhaseContext(
            current_input=user_input,
            original_topic=user_input,
            doc_context=doc_context,
            history_seed_ideas=history_seed_ideas,
            is_continuation=is_continuation,
            cancel_event=cancel_event,
            max_rounds=max_rounds,
            top_k=top_k,
            llm=self.llm,
            tools=self.tools,
        )

        total_cost = 0.0

        for round_num in range(1, max_rounds + 1):
            ctx.round = round_num

            # 取消检查
            if ctx.is_cancelled():
                yield {"type": "status", "phase": "cancelled", "round": round_num}
                return

            # 文档上下文注入通知（仅第一轮）
            if round_num == 1 and doc_context:
                yield {
                    "type": "doc_context",
                    "chunk_count": doc_context.count("[参考文献"),
                    "preview": doc_context[:300] + "..." if len(doc_context) > 300 else doc_context,
                }

            # 重置本轮流转字段（持久字段 history_seed_ideas / is_continuation /
            # agent_states 不动）。elo_scores 跟着流转字段走 —— 每轮 idea UUID 全新，
            # 上一轮的分数无法对应到本轮新 Message，留着只会让字典越来越大。
            ctx.ideas = []
            ctx.idea_groups = []
            ctx.refined_ideas = []
            ctx.synthesized = []
            ctx.top_ideas = []
            ctx.elo_scores = {}

            # 按顺序驱动 phases；Message 对象由各 phase 自己写入 ctx，本层只需透传 dict
            for phase in self.phases:
                async for event in phase.run(ctx):
                    if isinstance(event, Message):
                        # 流转数据由 phase 自己写入 ctx，对外 SSE 不重复发
                        continue
                    yield event
                if ctx.is_cancelled():
                    yield {"type": "status", "phase": "cancelled", "round": round_num}
                    return

            # 累计 cost
            for st in ctx.agent_states.values():
                total_cost += st.cost_usd
                st.cost_usd = 0  # 清零避免下一轮重复累加（agent_states 跨 round 复用）

            # ── 跨轮上下文累积 ──
            # 把本轮 top_ideas 喂给下一轮的 separate_phase（走 history_seed_ideas
            # + is_continuation 现成路径，下游 _build_messages 会原文注入，无截断）。
            # together / synthesize / tournament 仍只看本轮 separate 的输出，
            # 跨轮信号通过 separate 的"在上一轮基础上深化"自然传递。
            if ctx.top_ideas:
                ctx.history_seed_ideas = list(ctx.top_ideas)
                ctx.is_continuation = True

        # 最终输出
        final_ideas = []
        for idea in ctx.top_ideas:
            final_ideas.append(
                {
                    "id": idea.id,
                    "content": idea.content,
                    "author": idea.sender,
                    "elo_score": round(ctx.elo_scores.get(idea.id, 1500)),
                }
            )
        yield {"type": "done", "top_ideas": final_ideas, "cost_usd": round(total_cost, 4)}

    # ───────────────────────── helpers ───────────────────────────────────────

    @staticmethod
    def _extract_seed_ideas_from_history(history: list) -> List[Message]:
        """从会话历史中提取上一轮的最佳创意。

        匹配 ChatPanel 持久化的 metadata events 中含 '排名' + 'Elo=' 的 assistant 消息。
        """
        seed_ideas = []
        for msg in reversed(history):
            if msg.get("role") != "assistant":
                continue
            content = msg.get("content", "")
            if not content or content == "[生成结果已保存]":
                continue
            if "排名" in content and "Elo=" in content:
                sections = re.split(r"###\s*排名\s*\d+", content)
                for section in sections:
                    section = section.strip()
                    if not section or section.startswith("上一轮"):
                        continue
                    author_match = re.search(r"\(来自(\w+),", section)
                    author = author_match.group(1) if author_match else "previous_round"
                    clean = re.sub(r"\(来自\w+,\s*Elo=\d+\)\s*\n?", "", section).strip()
                    if clean:
                        seed_ideas.append(
                            Message(
                                id=str(uuid.uuid4()),
                                sender=author,
                                content=clean,
                                msg_type=MessageType.IDEA,
                            )
                        )
                break
        return seed_ideas
