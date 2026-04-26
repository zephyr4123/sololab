"""Synthesize 阶段：连接者跨组全局综合。

写出 ctx.synthesized（原 refined_ideas + 综合产物）。
"""

from __future__ import annotations

from typing import AsyncGenerator

from sololab.modules.ideaspark.agents.agent_runner import AgentRunner
from sololab.modules.ideaspark.agents.personas import get_persona
from sololab.modules.ideaspark.phases.base import Phase, PhaseContext, PhaseEvent


class SynthesizePhase(Phase):
    name = "synthesize"

    async def run(self, ctx: PhaseContext) -> AsyncGenerator[PhaseEvent, None]:
        yield {"type": "status", "phase": "synthesize", "round": ctx.round}

        ideas = ctx.refined_ideas
        if len(ideas) <= 3:
            ctx.synthesized = list(ideas)
            return

        connector_config = get_persona("connector")
        runner = AgentRunner(connector_config, ctx.llm, ctx.tools)
        task_prompt = (
            "你正在进行跨组全局整合。"
            "审阅之前讨论中的所有创意，识别最具独特性的优质创意。"
            "合并相似创意，去除重复，输出一个精简的最具前景研究方向列表。"
        )

        synthesized_msgs = []
        async for ev in runner.run_stream(
            ctx.original_topic,
            context_messages=ideas,
            task_prompt=task_prompt,
            doc_context=ctx.doc_context,
        ):
            if ev["type"] == "agent_done_with_messages":
                synthesized_msgs = ev["messages"]
            else:
                yield ev

        ctx.agent_states["connector"] = runner.state
        # 保留所有 refined_ideas + 跨组综合结果
        ctx.synthesized = list(ideas) + synthesized_msgs
