"""Together 阶段：每组 critic + connector 多轮辩论 + 综合。

并行执行所有 group，事件实时上吐（asyncio.Queue）。
写出 ctx.refined_ideas（含未被讨论的原始 ideas）。
"""

from __future__ import annotations

import asyncio
from typing import Any, AsyncGenerator, Dict, List

from sololab.modules.ideaspark.agents.agent_runner import AgentRunner
from sololab.modules.ideaspark.agents.personas import get_persona
from sololab.modules.ideaspark.phases.base import Phase, PhaseContext, PhaseEvent
from sololab.models.agent import Message


class TogetherPhase(Phase):
    name = "together"

    def __init__(self, iterations: int = 2) -> None:
        self.iterations = iterations

    async def run(self, ctx: PhaseContext) -> AsyncGenerator[PhaseEvent, None]:
        yield {
            "type": "status",
            "phase": "together",
            "round": ctx.round,
            "group_count": len(ctx.idea_groups),
        }

        # 各组并行 + 事件实时流式输出
        queue: asyncio.Queue = asyncio.Queue()
        _SENTINEL = object()

        async def _run_group_streaming(group: List[Message], group_idx: int) -> None:
            try:
                async for ev in self._discuss_group(ctx, group, group_idx):
                    await queue.put(ev)
            except Exception as e:
                await queue.put(
                    {"type": "agent", "agent": "unknown", "action": "error", "error": str(e)}
                )
            finally:
                await queue.put(_SENTINEL)

        group_tasks = [
            asyncio.create_task(_run_group_streaming(group, idx))
            for idx, group in enumerate(ctx.idea_groups)
        ]

        refined_ideas: List[Message] = []
        remaining = len(group_tasks)
        try:
            while remaining > 0:
                item = await queue.get()
                if item is _SENTINEL:
                    remaining -= 1
                    continue
                if isinstance(item, Message):
                    refined_ideas.append(item)
                yield item
        finally:
            for t in group_tasks:
                if not t.done():
                    t.cancel()

        # 保留未参与讨论的原始 idea
        refined_ids = {m.id for m in refined_ideas}
        for idea in ctx.ideas:
            if idea.id not in refined_ids:
                refined_ideas.append(idea)

        ctx.refined_ideas = refined_ideas

    async def _discuss_group(
        self, ctx: PhaseContext, group: List[Message], group_idx: int
    ) -> AsyncGenerator[PhaseEvent, None]:
        """单组讨论：critic + connector 交替 N 轮。

        所有 yield 出去的 dict 事件都带 group_idx + iteration 字段，
        让前端可以靠字段精确分组（多组并行下事件交错时不会归错组）。
        """
        critic_config = get_persona("critic")
        connector_config = get_persona("connector")

        def _tag(ev: Dict[str, Any], iteration: int) -> Dict[str, Any]:
            """给 dict 事件注入 group_idx / iteration（不修改 Message 对象）。"""
            if isinstance(ev, dict) and "group_idx" not in ev:
                ev["group_idx"] = group_idx
                ev["iteration"] = iteration
            return ev

        for i in range(self.iterations):
            # ── Critic 提批评 ──
            yield {
                "type": "agent",
                "agent": "critic",
                "action": f"reviewing group {group_idx + 1}, round {i + 1}",
                "group_idx": group_idx,
                "iteration": i,
            }
            critic_runner = AgentRunner(critic_config, ctx.llm, ctx.tools)
            critic_task = (
                f"审辩第 {group_idx + 1} 组的以下创意。"
                f"找出弱点并提出改进建议。\n\n"
                + "\n".join(f"- {m.content}" for m in group)
            )
            critiques: List[Message] = []
            async for ev in critic_runner.run_stream(
                ctx.original_topic,
                context_messages=group,
                task_prompt=critic_task,
                doc_context=ctx.doc_context,
            ):
                if isinstance(ev, dict) and ev.get("type") == "agent_done_with_messages":
                    critiques = ev["messages"]
                else:
                    yield _tag(ev, i)
            ctx.agent_states["critic"] = critic_runner.state

            for msg in critiques:
                ctx.blackboard.append(msg)
                yield {
                    "type": "agent",
                    "agent": "critic",
                    "action": "critique",
                    "content": msg.content,
                    "group_idx": group_idx,
                    "iteration": i,
                }
                yield msg

            # ── Connector 综合 ──
            yield {
                "type": "agent",
                "agent": "connector",
                "action": f"synthesizing group {group_idx + 1}, round {i + 1}",
                "group_idx": group_idx,
                "iteration": i,
            }
            conn_runner = AgentRunner(connector_config, ctx.llm, ctx.tools)
            conn_task = (
                f"基于第 {group_idx + 1} 组的创意和审辩意见，"
                f"通过结合优势和解决弱点来整合出改进后的创意。"
            )
            all_context = group + critiques
            syntheses: List[Message] = []
            async for ev in conn_runner.run_stream(
                ctx.original_topic,
                context_messages=all_context,
                task_prompt=conn_task,
                doc_context=ctx.doc_context,
            ):
                if isinstance(ev, dict) and ev.get("type") == "agent_done_with_messages":
                    syntheses = ev["messages"]
                else:
                    yield _tag(ev, i)
            ctx.agent_states["connector"] = conn_runner.state

            for msg in syntheses:
                ctx.blackboard.append(msg)
                yield {
                    "type": "agent",
                    "agent": "connector",
                    "action": "synthesis",
                    "content": msg.content,
                    "group_idx": group_idx,
                    "iteration": i,
                }
                yield msg
                group.append(msg)
