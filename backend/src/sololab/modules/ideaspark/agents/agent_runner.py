"""智能体执行引擎 —— 单个角色智能体的 LLM 调用 + 原生 function calling。"""

import json
import logging
import uuid
from typing import Any, Dict, List, Optional

from sololab.core.llm_gateway import LLMGateway
from sololab.core.tool_registry import ToolRegistry
from sololab.models.agent import AgentConfig, AgentState, Message, MessageType
from sololab.modules.ideaspark.prompts.system_prompts import get_prompt

logger = logging.getLogger(__name__)

# 最大工具调用轮次，防止死循环
MAX_TOOL_ROUNDS = 3


class AgentRunner:
    """执行单个角色智能体的完整生命周期。

    1. 构建 system prompt + context messages
    2. 调用 LLM generate（带 tools 参数）
    3. 如果 LLM 返回 tool_calls，执行工具并将结果注入上下文
    4. 循环直到 LLM 给出最终文本回复
    5. 解析输出为 Message 对象
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
        self.tool_events: List[Dict[str, Any]] = []  # 收集工具调用事件，供 orchestrator yield

    async def run(
        self,
        topic: str,
        context_messages: List[Message] = None,
        task_prompt: str = "",
        doc_context: str = "",
        is_continuation: bool = False,
    ) -> List[Message]:
        """执行智能体，返回生成的消息列表。"""
        self.state.status = "thinking"

        from datetime import datetime
        system_prompt = get_prompt(
            self.config.name,
            topic=topic or "(见上下文)",
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M"),
            is_continuation=is_continuation,
        )
        messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
        messages.extend(self._build_messages(topic, context_messages or [], task_prompt, doc_context))

        # 获取 OpenAI function calling 格式的工具定义
        openai_tools = None
        if self.tools and self.config.tools:
            openai_tools = self.tools.get_openai_tools(self.config.tools)
            if not openai_tools:
                openai_tools = None

        # 多轮工具调用循环
        content = ""
        for round_num in range(MAX_TOOL_ROUNDS + 1):
            result = await self.llm.generate(
                messages=messages,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                tools=openai_tools,
            )

            self.state.tokens_used += result["usage"]["prompt_tokens"] + result["usage"]["completion_tokens"]
            self.state.cost_usd += result["usage"]["cost_usd"]

            tool_calls = result.get("tool_calls")
            if not tool_calls:
                # LLM 给出了最终文本回复
                content = result["content"]
                break

            # LLM 请求调用工具 —— 执行并注入结果
            # 先把 assistant 的 tool_calls 消息加入上下文
            messages.append({
                "role": "assistant",
                "content": result["content"] or None,
                "tool_calls": [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": tc["function"],
                    }
                    for tc in tool_calls
                ],
            })

            for tc in tool_calls:
                tool_result = await self._execute_tool_call(tc)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(tool_result, ensure_ascii=False),
                })

            # 工具结果已注入，下一轮不再传 tools 参数，强制 LLM 给出最终回复
            if round_num >= MAX_TOOL_ROUNDS - 1:
                openai_tools = None
        else:
            # 超过最大轮次，用最后一次的 content
            content = result.get("content", "")

        # 解析输出为 Message
        parsed = self._parse_output(content)
        self.state.status = "done"
        self.state.messages_sent += len(parsed)
        self.state.last_action = f"generated {len(parsed)} message(s)"
        return parsed

    async def _execute_tool_call(self, tool_call: Dict[str, Any]) -> Dict[str, Any]:
        """执行单个工具调用并返回结果。"""
        func = tool_call["function"]
        tool_name = func["name"]
        try:
            arguments = json.loads(func["arguments"])
        except json.JSONDecodeError:
            return {"error": f"Invalid arguments JSON: {func['arguments']}"}

        if tool_name not in self.config.tools:
            return {"error": f"Tool {tool_name} not allowed for this agent"}

        tool = self.tools.get_tool(tool_name) if self.tools else None
        if not tool:
            return {"error": f"Tool {tool_name} not found in registry"}

        self.state.status = "executing"
        self.state.last_action = f"calling {tool_name}"

        # Query 改写：用 LLM 将原始 query 优化为更精确的搜索词
        original_query = arguments.get("query", "")
        rewritten_query = await self._rewrite_query(original_query, tool_name)
        arguments["query"] = rewritten_query

        logger.info(
            "智能体 %s 调用工具 %s: %s → %s",
            self.config.name, tool_name, original_query, rewritten_query,
        )

        tool_result = await tool.execute(arguments)

        # 提取搜索结果明细供前端展示
        raw_results = tool_result.data.get("results", []) if tool_result.data else []
        results_detail = [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": (r.get("content", "") or r.get("abstract", "") or r.get("summary", ""))[:200],
            }
            for r in raw_results[:5]
        ]

        # 收集工具事件供前端展示
        self.tool_events.append({
            "type": "tool",
            "agent": self.config.name,
            "tool": tool_name,
            "query": rewritten_query,
            "original_query": original_query,
            "success": tool_result.success,
            "result_preview": (tool_result.data.get("answer", "") or "")[:200] if tool_result.data else "",
            "result_count": len(raw_results),
            "results": results_detail,
            "error": tool_result.error,
        })
        return {
            "tool": tool_name,
            "query": rewritten_query,
            "success": tool_result.success,
            "data": tool_result.data,
            "error": tool_result.error,
        }

    async def _rewrite_query(self, query: str, tool_name: str) -> str:
        """用 LLM 将 agent 的搜索 query 改写为更精确的搜索词。

        对 arXiv/Scholar 等英文学术库，强制输出英文。
        """
        if not query.strip():
            return query

        is_academic = tool_name in ("arxiv_search", "scholar_search")
        target = "学术论文" if is_academic else "网页"
        lang_hint = "必须使用英文" if is_academic else "英文"

        try:
            result = await self.llm.generate(
                messages=[{
                    "role": "user",
                    "content": (
                        f"将以下搜索意图改写为 1 条精确的{target}搜索查询词（{lang_hint}，3-5 个关键词）。\n"
                        f"只输出关键词，用空格分隔，不要写完整句子。禁止输出中文。\n"
                        f"禁止使用 a/an/the/in/on/for/of/with/using/based 等停用词。\n\n"
                        f"原始意图：{query}"
                    ),
                }],
                temperature=0.0,
                max_tokens=60,
            )
            rewritten = result["content"].strip().strip('"').strip("'")
            self.state.tokens_used += result["usage"]["prompt_tokens"] + result["usage"]["completion_tokens"]
            self.state.cost_usd += result["usage"]["cost_usd"]

            # 对学术搜索，验证输出确实是英文（检测是否包含中文字符）
            if is_academic and rewritten and self._contains_chinese(rewritten):
                logger.warning("Query 改写仍含中文，丢弃: %s", rewritten)
                # 降级：用原始 query 中的英文部分，或直接用原 query
                fallback = self._extract_english(query)
                return fallback if fallback else query

            return rewritten if rewritten else query
        except Exception:
            return query  # 改写失败，使用原始 query

    @staticmethod
    def _contains_chinese(text: str) -> bool:
        """检查文本是否包含中文字符。"""
        return any('\u4e00' <= c <= '\u9fff' for c in text)

    @staticmethod
    def _extract_english(text: str) -> str:
        """从混合文本中提取英文单词。"""
        import re
        words = re.findall(r'[a-zA-Z][\w-]*', text)
        return ' '.join(words) if words else ""

    def _build_messages(
        self, topic: str, context: List[Message], task_prompt: str, doc_context: str = ""
    ) -> List[Dict[str, str]]:
        """构建发送给 LLM 的消息列表。

        上下文传递策略：
        - 按消息类型分类呈现（创意/批评/综合），而非按时间堆砌
        - 传递完整内容，不做截断
        - 标注消息来源和类型，便于 LLM 理解结构
        - 如果有文档上下文，作为独立消息注入
        """
        msgs: List[Dict[str, str]] = []

        # 文档参考文献上下文（放在最前面，让 agent 先看到参考资料）
        if doc_context:
            msgs.append({
                "role": "user",
                "content": (
                    f"以下是用户上传的参考文献摘要（仅供背景参考，不能替代网络搜索）：\n\n{doc_context}\n\n"
                    f"重要：这些文献只是起点。你仍然必须使用搜索工具查找该领域的最新进展和其他相关工作，"
                    f"不要仅依赖上述文献。"
                ),
            })

        if context:
            # 按类型分组
            by_type: Dict[str, List[str]] = {}
            for m in context:
                key = m.msg_type.value
                by_type.setdefault(key, []).append(f"- [{m.sender}]: {m.content}")

            TYPE_LABELS = {
                "idea": "已有的研究创意",
                "critique": "审辩意见",
                "synthesis": "综合方案",
                "vote": "评审结果",
            }

            parts = []
            for msg_type, items in by_type.items():
                label = TYPE_LABELS.get(msg_type, msg_type)
                parts.append(f"### {label}\n" + "\n".join(items))

            context_text = "\n\n".join(parts)
            msgs.append({
                "role": "user",
                "content": f"以下是之前的讨论内容，请基于这些信息展开你的工作：\n\n{context_text}",
            })

        # 当前任务
        prompt = task_prompt or f"研究主题：{topic}\n\n请基于这个主题提出你的创意和分析。"
        msgs.append({"role": "user", "content": prompt})
        return msgs

    def _parse_output(self, content: str) -> List[Message]:
        """解析 LLM 输出为 Message 对象列表。"""
        import re

        msg_type = self._detect_msg_type(content)

        # 清理认知规划部分（前 3 行反思），保留实质内容
        lines = content.strip().split("\n")
        clean_lines = []
        skip_planning = True
        for line in lines:
            stripped = line.strip()
            if skip_planning and (
                stripped.startswith("1.") or stripped.startswith("2.") or stripped.startswith("3.")
            ):
                continue
            skip_planning = False
            # 跳过 [msg_type: xxx] 标记行
            if re.match(r'^\[msg_type:\s*\w+\]', stripped):
                continue
            clean_lines.append(line)

        clean_content = "\n".join(clean_lines).strip()
        if not clean_content:
            clean_content = content.strip()

        # 自动附加搜索来源引用（兜底机制，确保即使 LLM 忘记引用也有来源记录）
        citations = self._collect_citations()
        if citations and "**参考文献**" not in clean_content and "**参考来源**" not in clean_content:
            clean_content += "\n\n---\n**参考来源（工具检索）**\n" + citations

        return [
            Message(
                id=str(uuid.uuid4()),
                sender=self.config.name,
                content=clean_content,
                msg_type=msg_type,
            )
        ]

    def _collect_citations(self) -> str:
        """从工具调用事件中提取论文引用，格式化为参考文献列表。"""
        seen_titles = set()
        citation_lines = []

        for event in self.tool_events:
            if not event.get("success"):
                continue
            tool_name = event.get("tool", "")
            results = event.get("results", [])

            for r in results:
                title = r.get("title", "").strip()
                if not title or title in seen_titles:
                    continue
                seen_titles.add(title)

                url = r.get("url", "")
                # 格式化引用条目
                if "arxiv.org" in url:
                    citation_lines.append(f"- {title} ({url})")
                elif "semanticscholar.org" in url or tool_name == "scholar_search":
                    citation_lines.append(f"- {title} ({url})" if url else f"- {title}")
                elif url:
                    citation_lines.append(f"- {title} ({url})")
                else:
                    citation_lines.append(f"- {title}")

        return "\n".join(citation_lines[:10])  # 最多保留 10 条

    def _detect_msg_type(self, content: str) -> MessageType:
        """从输出内容检测消息类型。"""
        content_lower = content.lower()
        if "[msg_type: vote]" in content_lower or "winner:" in content_lower:
            return MessageType.VOTE
        if "[msg_type: critique]" in content_lower:
            return MessageType.CRITIQUE
        if "[msg_type: synthesis]" in content_lower:
            return MessageType.SYNTHESIS
        return MessageType.IDEA
