"""Together 阶段：critic + connector 对全部创意多轮辩论 + 综合。

设计变更：不再分组。
理由：固定 2 personas × OutputParser 1:1，ctx.ideas 永远只有 2 条 Message，
"分组"在算法路径上只能产出"1 组 1 idea"或"1 组 2 idea"，不会带来语义价值。
直接以 ctx.ideas 为单批讨论集合，每轮 critic 找弱点 → connector 整合改进。
连接者输出会追加进当前讨论集合，下一轮 critic 也能看见。

事件标记：每个 dict 事件带 iteration 字段（前端按它分组渲染）。
group_idx 概念彻底移除。
"""

from __future__ import annotations

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
            "idea_count": len(ctx.ideas),
        }

        if not ctx.ideas:
            ctx.refined_ideas = []
            return

        critic_config = get_persona("critic")
        connector_config = get_persona("connector")

        # 当前讨论集合：随每轮 connector 输出累加，下一轮 critic 也能看到
        current_ideas: List[Message] = list(ctx.ideas)
        # 跨轮收集所有 connector 综合产物（不含原始 ideas）
        synth_outputs: List[Message] = []

        def _tag(ev: Dict[str, Any], iteration: int) -> Dict[str, Any]:
            """给 dict 事件注入 iteration 字段（不修改 Message 对象）。"""
            if isinstance(ev, dict) and "iteration" not in ev:
                ev["iteration"] = iteration
            return ev

        for i in range(self.iterations):
            # ── Critic 全量评议 ──
            yield {
                "type": "agent",
                "agent": "critic",
                "action": f"reviewing round {i + 1}",
                "iteration": i,
            }
            critic_runner = AgentRunner(critic_config, ctx.llm, ctx.tools)
            critic_task = (
                "对以下全部创意进行整体审辩。逐一找出每个创意的弱点并提出改进建议。\n\n"
                + "\n\n".join(f"- {m.content}" for m in current_ideas)
            )
            critiques: List[Message] = []
            async for ev in critic_runner.run_stream(
                ctx.original_topic,
                context_messages=current_ideas,
                task_prompt=critic_task,
                doc_context=ctx.doc_context,
            ):
                if isinstance(ev, dict) and ev.get("type") == "agent_done_with_messages":
                    critiques = ev["messages"]
                else:
                    yield _tag(ev, i)
            ctx.agent_states["critic"] = critic_runner.state

            for msg in critiques:
                yield {
                    "type": "agent",
                    "agent": "critic",
                    "action": "critique",
                    "content": msg.content,
                    "iteration": i,
                }
                yield msg

            # ── Connector 全量整合 ──
            yield {
                "type": "agent",
                "agent": "connector",
                "action": f"synthesizing round {i + 1}",
                "iteration": i,
            }
            conn_runner = AgentRunner(connector_config, ctx.llm, ctx.tools)
            conn_task = (
                "基于上述全部创意和审辩意见，"
                "通过结合各创意的优势、化解审辩指出的风险，整合出 1 个更优的研究计划。"
            )
            all_context = current_ideas + critiques
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
                yield {
                    "type": "agent",
                    "agent": "connector",
                    "action": "synthesis",
                    "content": msg.content,
                    "iteration": i,
                }
                yield msg
                # 下一轮 critic 也能看到这一轮的 synthesis
                current_ideas.append(msg)
                synth_outputs.append(msg)

        # refined_ideas = 原始 ideas + 所有 connector 综合产物
        ctx.refined_ideas = list(ctx.ideas) + synth_outputs
