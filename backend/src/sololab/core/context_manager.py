"""上下文窗口管理器 - 滑动窗口、摘要压缩、引用追踪。"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class ContextWindowManager:
    """管理 LLM 对话的上下文窗口。

    功能：
    1. 滑动窗口：保留最近 N 条消息
    2. 摘要压缩：超出窗口的消息自动压缩为摘要
    3. 引用追踪：保留被引用的消息，裁剪孤立消息
    """

    def __init__(
        self,
        llm_gateway: Any,
        max_messages: int = 50,
        summary_threshold: int = 30,
        max_tokens_estimate: int = 100000,
    ) -> None:
        self.llm = llm_gateway
        self.max_messages = max_messages
        self.summary_threshold = summary_threshold
        self.max_tokens_estimate = max_tokens_estimate

    async def manage_context(
        self,
        messages: List[Dict[str, str]],
        referenced_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, str]]:
        """管理上下文窗口，返回优化后的消息列表。

        Args:
            messages: 完整的消息历史
            referenced_ids: 被引用的消息 ID 列表（不可裁剪）

        Returns:
            优化后的消息列表（保持 OpenAI 格式）
        """
        if len(messages) <= self.max_messages:
            return messages

        # 步骤 1：识别被引用的消息（不可裁剪）
        protected_indices = set()
        if referenced_ids:
            for i, msg in enumerate(messages):
                msg_id = msg.get("id") or msg.get("metadata", {}).get("id")
                if msg_id and msg_id in referenced_ids:
                    protected_indices.add(i)

        # 步骤 2：保留系统消息（始终保留第一条）
        system_messages = []
        non_system_messages = []
        for i, msg in enumerate(messages):
            if msg.get("role") == "system":
                system_messages.append(msg)
            else:
                non_system_messages.append((i, msg))

        # 步骤 3：如果超过阈值，压缩早期消息为摘要
        if len(non_system_messages) > self.summary_threshold:
            # 需要压缩的消息数量
            to_compress = len(non_system_messages) - self.summary_threshold
            early_messages = non_system_messages[:to_compress]
            recent_messages = non_system_messages[to_compress:]

            # 检查被保护的消息
            unprotected_early = [
                (i, msg) for i, msg in early_messages if i not in protected_indices
            ]
            protected_early = [
                (i, msg) for i, msg in early_messages if i in protected_indices
            ]

            # 压缩未保护的早期消息
            if unprotected_early:
                summary = await self._compress_messages(
                    [msg for _, msg in unprotected_early]
                )
                summary_msg = {
                    "role": "system",
                    "content": f"[Context Summary] {summary}",
                }
                result = system_messages + [summary_msg]
                # 添加被保护的早期消息
                result.extend(msg for _, msg in protected_early)
                # 添加近期消息
                result.extend(msg for _, msg in recent_messages)
                return result[-self.max_messages:]
            else:
                # 所有早期消息都被保护，只做滑动窗口
                all_msgs = system_messages + [msg for _, msg in non_system_messages]
                return all_msgs[-self.max_messages:]

        # 步骤 4：滑动窗口
        all_msgs = system_messages + [msg for _, msg in non_system_messages]
        return all_msgs[-self.max_messages:]

    async def _compress_messages(self, messages: List[Dict[str, str]]) -> str:
        """将多条消息压缩为简洁摘要。"""
        content_parts = []
        for msg in messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")[:500]  # 截断过长的内容
            content_parts.append(f"[{role}] {content}")

        combined = "\n".join(content_parts)

        try:
            result = await self.llm.generate(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a conversation summarizer. "
                            "Compress the following conversation into a brief summary "
                            "that preserves key decisions, facts, and context. "
                            "Be concise but don't lose important information."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Summarize this conversation:\n\n{combined}",
                    },
                ],
                temperature=0.1,
                max_tokens=500,
            )
            return result["content"]
        except Exception as e:
            logger.warning("消息压缩失败，使用简单截断: %s", e)
            return f"Earlier conversation ({len(messages)} messages) covered: " + combined[:300]

    def estimate_tokens(self, messages: List[Dict[str, str]]) -> int:
        """估算消息列表的 token 数量（粗略估算：1 token ≈ 4 字符）。"""
        total_chars = sum(len(msg.get("content", "")) for msg in messages)
        return total_chars // 4

    def prune_orphan_messages(
        self,
        messages: List[Dict[str, str]],
        reference_graph: Dict[str, List[str]],
    ) -> List[Dict[str, str]]:
        """裁剪没有引用链的孤立消息。

        Args:
            messages: 消息列表
            reference_graph: {message_id: [referenced_message_ids]}

        Returns:
            裁剪后的消息列表
        """
        # 收集所有被引用的消息 ID
        referenced = set()
        for refs in reference_graph.values():
            referenced.update(refs)

        # 保留被引用的、有引用关系的、以及最近的消息
        keep_indices = set()
        for i, msg in enumerate(messages):
            msg_id = msg.get("id") or msg.get("metadata", {}).get("id")
            # 保留条件：系统消息、被引用、有引用、或是最近的 N 条
            if (
                msg.get("role") == "system"
                or (msg_id and msg_id in referenced)
                or (msg_id and msg_id in reference_graph)
                or i >= len(messages) - self.max_messages
            ):
                keep_indices.add(i)

        return [msg for i, msg in enumerate(messages) if i in keep_indices]
