"""IdeaSpark 流程编排 —— Pipeline 组合器（Strategy 模式）。

职责仅剩三件：
1. 构造 PhaseContext（注入依赖、初始化输入字段）
2. 按顺序驱动 phases 列表，分流 Message 与 dict 事件
3. 多轮收敛检查 + Top-K refine 输出

具体阶段算法全部下沉到 sololab.modules.ideaspark.phases.*。
新增/替换阶段只需改 self.phases 列表，无需触碰本类。
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
    ClusterPhase,
    Phase,
    PhaseContext,
    SeparatePhase,
    SynthesizePhase,
    TogetherPhase,
    TournamentPhase,
)


class Orchestrator:
    """IdeaSpark Pipeline 组合器。

    默认流水线：Separate → Cluster → Together → Synthesize → Tournament
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
            ClusterPhase(),
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
        # 从历史中提取上一轮种子创意（多轮对话用）
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

        prev_top_ids: List[str] = []
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

            # 重置本轮临时流转字段（跨轮持久字段不动）
            ctx.ideas = []
            ctx.idea_groups = []
            ctx.refined_ideas = []
            ctx.synthesized = []
            ctx.top_ideas = []

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

            # 收敛检查
            current_ids = [m.id for m in ctx.top_ideas]
            if prev_top_ids:
                overlap = len(set(current_ids) & set(prev_top_ids))
                stability = overlap / max(len(current_ids), 1)
                if stability >= 0.8:
                    yield {"type": "status", "phase": "converged", "round": round_num}
                    break
            prev_top_ids = current_ids

            # 用 Top-K 改写下一轮输入
            ctx.current_input = self._refine_prompt(ctx.current_input, ctx.top_ideas)

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
    def _refine_prompt(original_topic: str, top_ideas: List[Message]) -> str:
        """从 Top-K 创意生成下一轮的优化提示。"""
        idea_summaries = "\n".join(f"- {m.content[:150]}" for m in top_ideas[:3])
        return (
            f"原始主题：{original_topic}\n\n"
            f"目前最佳创意：\n{idea_summaries}\n\n"
            f"请深化、延展和改进这些创意，探索新的角度和组合。"
        )

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
