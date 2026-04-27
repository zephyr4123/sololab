"""Separate 阶段：发散者 + 领域专家并行检索 + 出创意。

实现要点：
- 两个 agent 并发跑 run_stream，事件通过 asyncio.Queue 实时上吐
- 处理多轮对话：is_continuation 时附加 continuation_prompt + 注入种子创意
- 写出 ctx.ideas / ctx.agent_states
"""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator

from sololab.modules.ideaspark.agents.agent_runner import AgentRunner
from sololab.modules.ideaspark.agents.personas import get_persona
from sololab.modules.ideaspark.phases.base import Phase, PhaseContext, PhaseEvent
from sololab.models.agent import Message


class SeparatePhase(Phase):
    name = "separate"

    async def run(self, ctx: PhaseContext) -> AsyncGenerator[PhaseEvent, None]:
        # 入场状态
        yield {"type": "status", "phase": "separate", "round": ctx.round}

        sep_personas = [get_persona("divergent"), get_persona("expert")]
        runners = [(p.name, AgentRunner(p, ctx.llm, ctx.tools)) for p in sep_personas]

        # 立即通知前端 agent 开始（占位 thinking 状态）
        for name, _ in runners:
            yield {"type": "agent", "agent": name, "action": "thinking"}

        # 多轮延续提示
        continuation_prompt = ""
        if ctx.is_continuation and ctx.history_seed_ideas:
            continuation_prompt = (
                "重要：这是用户的后续请求，你必须基于之前的研究成果来回答。\n"
                "不要从零开始，而是在上一轮的最佳创意基础上，按照用户的新指令进行深入、细化或调整。\n"
                "上一轮已有的创意已在上下文中提供。"
            )

        # Queue + Sentinel 让两个 agent 的事件实时交错上吐
        queue: asyncio.Queue = asyncio.Queue()
        _SENTINEL = object()

        async def _run_agent(name: str, runner: AgentRunner) -> None:
            try:
                messages: list[Message] = []
                async for ev in runner.run_stream(
                    ctx.current_input,
                    context_messages=ctx.history_seed_ideas if ctx.is_continuation else None,
                    task_prompt=continuation_prompt if continuation_prompt else "",
                    doc_context=ctx.doc_context,
                    is_continuation=ctx.is_continuation,
                ):
                    if ev["type"] == "agent_done_with_messages":
                        messages = ev["messages"]
                    else:
                        await queue.put(ev)
                ctx.agent_states[name] = runner.state
                # 过滤空 / 过短 message（OutputParser 已经过滤，这里二道防线）
                valid_messages = [m for m in messages if m.content and len(m.content.strip()) >= 30]
                import logging as _log
                _log.getLogger("sololab.ideaspark.separate").info(
                    "[DBG-SEPARATE] agent=%s total=%d valid=%d content_lens=%s",
                    name,
                    len(messages),
                    len(valid_messages),
                    [len(m.content) for m in valid_messages],
                )
                if not valid_messages:
                    # agent 没产生有效 idea —— 通知前端但不污染下游
                    await queue.put(
                        {
                            "type": "agent",
                            "agent": name,
                            "action": "empty",
                            "error": "未生成有效内容（多轮工具调用后未给最终输出）",
                        }
                    )
                else:
                    await queue.put(
                        {"type": "agent", "agent": name, "action": "done", "message_count": len(valid_messages)}
                    )
                    for msg in valid_messages:
                        await queue.put(
                            {"type": "idea", "id": msg.id, "content": msg.content, "author": name}
                        )
                        await queue.put(msg)  # Message 对象供下一阶段使用
            except Exception as e:
                await queue.put(
                    {"type": "agent", "agent": name, "action": "error", "error": str(e)}
                )
            finally:
                await queue.put(_SENTINEL)

        tasks = [asyncio.create_task(_run_agent(n, r)) for n, r in runners]
        remaining = len(tasks)
        try:
            while remaining > 0:
                item = await queue.get()
                if item is _SENTINEL:
                    remaining -= 1
                    continue
                # Message 对象是流转数据，dict 是业务事件 —— 都向上 yield，由 pipeline 分流
                if isinstance(item, Message):
                    ctx.ideas.append(item)
                yield item
        finally:
            for t in tasks:
                if not t.done():
                    t.cancel()
