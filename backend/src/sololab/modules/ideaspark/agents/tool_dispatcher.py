"""工具调度器 —— 工具执行 + Query 改写 + 事件收集。

把 AgentRunner 里的工具相关逻辑独立成单一类，解决原有 SRP 违反：
- _execute_tool_call 既做参数解析、权限校验、又调 LLM 做 query rewrite、又执行工具
- query rewrite 是"工具内部嵌套 LLM 调用"，应当属于工具调度而不是 agent 主循环

ToolDispatcher 持有 events 列表（供下游 OutputParser 取用、Agent 流式上吐），
以及 query rewrite 阶段的 token / cost 副作用统计（agent 主循环聚合）。
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, Set

from sololab.core.llm_gateway import LLMGateway
from sololab.core.tool_registry import ToolRegistry

logger = logging.getLogger(__name__)


class ToolDispatcher:
    """单 agent 的工具调度器（按 persona 实例化，含 allowed tools 白名单）。"""

    def __init__(
        self,
        persona_name: str,
        allowed_tools: List[str],
        registry: Optional[ToolRegistry],
        llm: LLMGateway,
    ) -> None:
        self.persona_name = persona_name
        self.allowed_tools: Set[str] = set(allowed_tools or [])
        self.registry = registry
        self.llm = llm
        # 工具事件收集（每次 execute 追加一条），供前端展示与引用提取
        self.events: List[Dict[str, Any]] = []
        # query rewrite 累计开销（agent 主循环聚合到 state）
        self.tokens_used: int = 0
        self.cost_usd: float = 0.0

    async def execute(self, tool_call: Dict[str, Any]) -> Dict[str, Any]:
        """执行单次工具调用，返回结果字典；副作用：追加 events、累计开销。"""
        func = tool_call["function"]
        tool_name = func["name"]

        try:
            arguments = json.loads(func["arguments"])
        except json.JSONDecodeError:
            return {"error": f"Invalid arguments JSON: {func['arguments']}"}

        if tool_name not in self.allowed_tools:
            return {"error": f"Tool {tool_name} not allowed for this agent"}

        tool = self.registry.get_tool(tool_name) if self.registry else None
        if not tool:
            return {"error": f"Tool {tool_name} not found in registry"}

        # Query 改写（用 LLM 优化为更精确搜索词）
        original_query = arguments.get("query", "")
        rewritten_query = await self._rewrite_query(original_query, tool_name)
        arguments["query"] = rewritten_query

        logger.info(
            "智能体 %s 调用工具 %s: %s → %s",
            self.persona_name, tool_name, original_query, rewritten_query,
        )

        tool_result = await tool.execute(arguments)

        # 收集结果明细供前端展示
        raw_results = tool_result.data.get("results", []) if tool_result.data else []
        results_detail = [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": (
                    r.get("content", "") or r.get("abstract", "") or r.get("summary", "")
                )[:200],
            }
            for r in raw_results[:5]
        ]

        self.events.append(
            {
                "type": "tool",
                "agent": self.persona_name,
                "tool": tool_name,
                "query": rewritten_query,
                "original_query": original_query,
                "success": tool_result.success,
                "result_preview": (
                    tool_result.data.get("answer", "") or "" if tool_result.data else ""
                )[:200],
                "result_count": len(raw_results),
                "results": results_detail,
                "error": tool_result.error,
            }
        )

        return {
            "tool": tool_name,
            "query": rewritten_query,
            "success": tool_result.success,
            "data": tool_result.data,
            "error": tool_result.error,
        }

    async def _rewrite_query(self, query: str, tool_name: str) -> str:
        """LLM 改写搜索 query 为更精确的关键词。失败兜底原 query。"""
        if not query.strip():
            return query

        is_academic = tool_name in ("arxiv_search", "scholar_search")
        target = "学术论文" if is_academic else "网页"
        lang_hint = "必须使用英文" if is_academic else "英文"

        try:
            result = await self.llm.generate(
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"将以下搜索意图改写为 1 条精确的{target}搜索查询词（{lang_hint}，3-5 个关键词）。\n"
                            f"只输出关键词，用空格分隔，不要写完整句子。禁止输出中文。\n"
                            f"禁止使用 a/an/the/in/on/for/of/with/using/based 等停用词。\n\n"
                            f"原始意图：{query}"
                        ),
                    }
                ],
                temperature=0.0,
                max_tokens=60,
            )
            rewritten = (result["content"] or "").strip().strip('"').strip("'")
            self.tokens_used += result["usage"]["prompt_tokens"] + result["usage"]["completion_tokens"]
            self.cost_usd += result["usage"]["cost_usd"]

            # 学术搜索强制英文
            if is_academic and rewritten and self._contains_chinese(rewritten):
                logger.warning("Query 改写仍含中文，丢弃: %s", rewritten)
                fallback = self._extract_english(query)
                return fallback if fallback else query
            return rewritten if rewritten else query
        except Exception:
            return query

    @staticmethod
    def _contains_chinese(text: str) -> bool:
        return any("一" <= c <= "鿿" for c in text)

    @staticmethod
    def _extract_english(text: str) -> str:
        words = re.findall(r"[a-zA-Z][\w-]*", text)
        return " ".join(words) if words else ""
