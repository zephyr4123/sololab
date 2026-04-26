"""LLM 输出解析器 —— DSML 剥离 + 消息类型识别 + 引用追加。

把 AgentRunner 的"解析责任"独立成单一类：
- _DSML_*_RE: DeepSeek V4 残留标记（provider 层剥离已是第一道防线，本类二道）
- _detect_msg_type: 从内容启发式判断 MessageType（vote/critique/synthesis/idea）
- _strip_planning_lines: 去掉 LLM 输出的"思考规划"前 3 行（"1. ... 2. ... 3. ..."）
- _append_citations: 从工具事件兜底补充参考来源（防 LLM 忘引用）

类似 Strategy + Helper —— 暴露单一 parse() 入口，供 Agent 调用。
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List

from sololab.models.agent import Message, MessageType

_DSML_BLOCK_RE = re.compile(
    r"<[\|｜]\s*DSML\s*[\|｜][^>]*>.*?<\/[\|｜]\s*DSML\s*[\|｜][^>]*>",
    re.DOTALL,
)
_DSML_TAG_RE = re.compile(r"<\/?[\|｜]\s*DSML\s*[\|｜][^>]*>")
_MSG_TYPE_TAG_RE = re.compile(r"^\[msg_type:\s*\w+\]")


class OutputParser:
    """单 agent 输出解析器（无状态，按 persona 名构造）。"""

    def __init__(self, persona_name: str) -> None:
        self.persona_name = persona_name

    def parse(self, content: str, tool_events: List[Dict[str, Any]]) -> List[Message]:
        """主入口：原始内容 + 工具事件 → Message 列表。

        空 content 防御：DSML 剥离后若不到 30 字，视为 LLM 失败输出
        （典型场景：DeepSeek V4 在最后无工具轮仍 hallucinate <｜DSML｜tool_calls> 标签，
        全部被剥离后 content 为空），返回空列表 —— 让 separate_phase 等下游能跳过空 idea，
        避免污染 cluster / critic 的 group。
        """
        # 第二道 DSML 防线（provider 层是第一道）
        content = _DSML_BLOCK_RE.sub("", content)
        content = _DSML_TAG_RE.sub("", content)

        msg_type = self._detect_msg_type(content)
        clean_content = self._strip_planning_lines(content) or content.strip()

        # 空 / 过短内容 = LLM 失败输出，下游不应当作有效 message
        if len(clean_content.strip()) < 30:
            import logging
            logging.getLogger(__name__).warning(
                "%s 输出内容过短（%d 字），视为失败输出，返回空列表",
                self.persona_name, len(clean_content.strip()),
            )
            return []

        clean_content = self._append_citations(clean_content, tool_events)

        return [
            Message(
                id=str(uuid.uuid4()),
                sender=self.persona_name,
                content=clean_content,
                msg_type=msg_type,
            )
        ]

    @staticmethod
    def _detect_msg_type(content: str) -> MessageType:
        lower = content.lower()
        if "[msg_type: vote]" in lower or "winner:" in lower:
            return MessageType.VOTE
        if "[msg_type: critique]" in lower:
            return MessageType.CRITIQUE
        if "[msg_type: synthesis]" in lower:
            return MessageType.SYNTHESIS
        return MessageType.IDEA

    @staticmethod
    def _strip_planning_lines(content: str) -> str:
        """去掉 LLM 前 3 行规划反思 + [msg_type:xxx] 标记行。"""
        lines = content.strip().split("\n")
        clean_lines: List[str] = []
        skip_planning = True
        for line in lines:
            stripped = line.strip()
            if skip_planning and (
                stripped.startswith("1.")
                or stripped.startswith("2.")
                or stripped.startswith("3.")
            ):
                continue
            skip_planning = False
            if _MSG_TYPE_TAG_RE.match(stripped):
                continue
            clean_lines.append(line)
        return "\n".join(clean_lines).strip()

    def _append_citations(self, content: str, tool_events: List[Dict[str, Any]]) -> str:
        """LLM 忘了引用时，从工具结果里抽出参考来源附在末尾。

        防御：当 content 过短（< 50 字符）时不追加，避免出现"只有参考来源没正文"
        的怪象（典型场景：LLM 调完工具就停了，没给最终结论）。
        """
        # 内容太短时不追加引用 —— 让用户看到的是"空内容"而不是"误导性的引用列表"
        if not content or len(content.strip()) < 50:
            import logging
            logging.getLogger(__name__).warning(
                "%s 输出内容过短（%d 字），跳过参考来源追加",
                self.persona_name, len(content) if content else 0,
            )
            return content
        if not tool_events:
            return content
        if "**参考文献**" in content or "**参考来源**" in content:
            return content

        seen_titles: set[str] = set()
        citation_lines: List[str] = []
        for event in tool_events:
            if not event.get("success"):
                continue
            tool_name = event.get("tool", "")
            for r in event.get("results") or []:
                title = (r.get("title") or "").strip()
                if not title or title in seen_titles:
                    continue
                seen_titles.add(title)
                url = r.get("url", "")
                if "arxiv.org" in url or url:
                    citation_lines.append(f"- {title} ({url})" if url else f"- {title}")
                else:
                    citation_lines.append(f"- {title}")

        if not citation_lines:
            return content
        return content + "\n\n---\n**参考来源（工具检索）**\n" + "\n".join(citation_lines[:10])
