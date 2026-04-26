"""单 agent 主循环 —— 协调 LLM / ToolDispatcher / OutputParser。

重构后职责单一化：
- LLM 多轮调用 + tools 决策 → 本类
- 工具执行 + query 改写 → ToolDispatcher
- 输出解析（DSML 剥离 / 类型识别 / 引用追加）→ OutputParser
- 系统提示 + 上下文消息构造 → _build_messages（agent 私有，规模小不抽出）

公开 API（AgentRunner.run / run_stream / state / tool_events）保持向后兼容。
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Optional

from sololab.core.llm_gateway import LLMGateway
from sololab.core.tool_registry import ToolRegistry
from sololab.models.agent import AgentConfig, AgentState, Message
from sololab.modules.ideaspark.agents.output_parser import OutputParser
from sololab.modules.ideaspark.agents.tool_dispatcher import ToolDispatcher
from sololab.modules.ideaspark.prompts.system_prompts import get_prompt

logger = logging.getLogger(__name__)

# 最大工具调用轮次（防死循环）
MAX_TOOL_ROUNDS = 3


class AgentRunner:
    """执行单 persona 的完整生命周期。

    流程：
    1. 构建 system prompt + context messages
    2. 调用 LLM（流式 generate_stream）+ 多轮工具调用循环
    3. 工具调用委派给 ToolDispatcher
    4. 最终内容委派给 OutputParser → Message 列表
    """

    def __init__(
        self,
        config: AgentConfig,
        llm_gateway: LLMGateway,
        tool_registry: Optional[ToolRegistry] = None,
    ) -> None:
        self.config = config
        self.llm = llm_gateway
        self.tools = tool_registry
        self.state = AgentState(name=config.name)
        # 子组件
        self._dispatcher = ToolDispatcher(
            persona_name=config.name,
            allowed_tools=config.tools,
            registry=tool_registry,
            llm=llm_gateway,
        )
        self._parser = OutputParser(persona_name=config.name)

    # ───────────────────── 兼容旧调用：tool_events 属性 ─────────────────────

    @property
    def tool_events(self) -> List[Dict[str, Any]]:
        return self._dispatcher.events

    # ───────────────────── 非流式入口 ─────────────────────────────────────

    async def run(
        self,
        topic: str,
        context_messages: Optional[List[Message]] = None,
        task_prompt: str = "",
        doc_context: str = "",
        is_continuation: bool = False,
    ) -> List[Message]:
        """非流式：跑完整轮 + 返回最终 Message 列表（消费 run_stream）。"""
        messages: List[Message] = []
        async for ev in self.run_stream(
            topic,
            context_messages=context_messages,
            task_prompt=task_prompt,
            doc_context=doc_context,
            is_continuation=is_continuation,
        ):
            if ev["type"] == "agent_done_with_messages":
                messages = ev["messages"]
        return messages

    # ───────────────────── 流式入口（核心） ────────────────────────────────

    async def run_stream(
        self,
        topic: str,
        context_messages: Optional[List[Message]] = None,
        task_prompt: str = "",
        doc_context: str = "",
        is_continuation: bool = False,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """流式执行，逐 token yield 增量事件。

        Yields:
            {"type": "agent_reasoning_delta", "agent": str, "delta": str}
            {"type": "agent_content_delta",   "agent": str, "delta": str}
            {"type": "tool", ...}                       工具结果（同步）
            {"type": "agent_done_with_messages", "messages": [Message]}
        """
        self.state.status = "thinking"

        # ── 构造消息序列 ──
        system_prompt = get_prompt(
            self.config.name,
            topic=topic or "(见上下文)",
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M"),
            is_continuation=is_continuation,
        )
        messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
        messages.extend(
            self._build_messages(topic, context_messages or [], task_prompt, doc_context)
        )

        # ── 工具白名单（OpenAI function 形式）──
        openai_tools: Optional[List[Dict[str, Any]]] = None
        if self.tools and self.config.tools:
            openai_tools = self.tools.get_openai_tools(self.config.tools) or None

        # ── 多轮工具循环 ──
        content = ""
        result: Optional[Dict[str, Any]] = None
        for round_num in range(MAX_TOOL_ROUNDS + 1):
            result = None
            async for chunk in self.llm.generate_stream(
                messages=messages,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                tools=openai_tools,
            ):
                t = chunk["type"]
                if t == "reasoning":
                    yield {
                        "type": "agent_reasoning_delta",
                        "agent": self.config.name,
                        "delta": chunk["delta"],
                    }
                elif t == "content":
                    yield {
                        "type": "agent_content_delta",
                        "agent": self.config.name,
                        "delta": chunk["delta"],
                    }
                elif t == "done":
                    result = chunk
                # tool_call_init / tool_call_arg_delta：不向上传，前端无需 partial JSON

            if not result:
                raise RuntimeError("LLM stream ended without 'done' event")

            self.state.tokens_used += (
                result["usage"]["prompt_tokens"] + result["usage"]["completion_tokens"]
            )
            self.state.cost_usd += result["usage"]["cost_usd"]

            tool_calls = result.get("tool_calls")
            if not tool_calls:
                content = result["content"]
                break

            # ── 注入 raw assistant message（含 reasoning_content 等扩展字段）──
            raw_msg = result.get("raw_assistant_message")
            if raw_msg:
                messages.append(raw_msg)
            else:
                messages.append(
                    {
                        "role": "assistant",
                        "content": result["content"] or None,
                        "tool_calls": [
                            {"id": tc["id"], "type": "function", "function": tc["function"]}
                            for tc in tool_calls
                        ],
                    }
                )

            # ── 通过 dispatcher 执行每个 tool_call，事件实时上吐 ──
            for tc in tool_calls:
                existing = len(self._dispatcher.events)
                tool_result = await self._dispatcher.execute(tc)
                import json as _json

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": _json.dumps(tool_result, ensure_ascii=False),
                    }
                )
                # yield dispatcher 新追加的事件（通常每次 1 条）
                for ev in self._dispatcher.events[existing:]:
                    yield ev

            # 进入最后一轮前禁用 tools，强制 LLM 给最终回复
            if round_num >= MAX_TOOL_ROUNDS - 1:
                openai_tools = None
        else:
            # 超过最大轮次，用最后一次的 content
            content = (result or {}).get("content", "")

        # ── 把 dispatcher 的 query rewrite 成本累加进 agent state ──
        self.state.tokens_used += self._dispatcher.tokens_used
        self.state.cost_usd += self._dispatcher.cost_usd

        # ── 解析输出 → Message 列表 ──
        parsed = self._parser.parse(content, self._dispatcher.events)
        self.state.status = "done"
        self.state.messages_sent += len(parsed)
        self.state.last_action = f"generated {len(parsed)} message(s)"

        yield {"type": "agent_done_with_messages", "messages": parsed}

    # ───────────────────── 私有：上下文消息构造 ─────────────────────────────

    def _build_messages(
        self,
        topic: str,
        context: List[Message],
        task_prompt: str,
        doc_context: str = "",
    ) -> List[Dict[str, str]]:
        """构造发给 LLM 的 user/system/assistant 消息序列。

        策略：
        - 文档参考置于最前，提示其为背景而非替代
        - 上下文消息按类型分组（创意/批评/综合/评审）呈现，不做截断
        - 当前任务作为最后一条 user message
        """
        msgs: List[Dict[str, str]] = []

        if doc_context:
            msgs.append(
                {
                    "role": "user",
                    "content": (
                        f"以下是用户上传的参考文献摘要（仅供背景参考，不能替代网络搜索）：\n\n"
                        f"{doc_context}\n\n"
                        f"重要：这些文献只是起点。你仍然必须使用搜索工具查找该领域的最新进展和其他相关工作，"
                        f"不要仅依赖上述文献。"
                    ),
                }
            )

        if context:
            by_type: Dict[str, List[str]] = {}
            for m in context:
                key = m.msg_type.value
                by_type.setdefault(key, []).append(f"- [{m.sender}]: {m.content}")

            type_labels = {
                "idea": "已有的研究创意",
                "critique": "审辩意见",
                "synthesis": "综合方案",
                "vote": "评审结果",
            }
            parts = []
            for msg_type, items in by_type.items():
                label = type_labels.get(msg_type, msg_type)
                parts.append(f"### {label}\n" + "\n".join(items))

            msgs.append(
                {
                    "role": "user",
                    "content": (
                        f"以下是之前的讨论内容，请基于这些信息展开你的工作：\n\n"
                        f"{chr(10).join(['', *parts, ''])}".strip()
                    ),
                }
            )

        prompt = task_prompt or f"研究主题：{topic}\n\n请基于这个主题提出你的创意和分析。"
        msgs.append({"role": "user", "content": prompt})
        return msgs
