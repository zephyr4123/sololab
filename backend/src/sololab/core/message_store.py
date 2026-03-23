"""消息持久化 - 黑板消息存储到 PostgreSQL。"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import async_sessionmaker

logger = logging.getLogger(__name__)


class MessageStore:
    """将黑板消息持久化到 PostgreSQL。

    功能：
    - 存储运行期间的所有黑板消息
    - 按 task_id / module_id 查询运行历史
    - 导出运行结果为结构化数据
    """

    def __init__(self, db: async_sessionmaker) -> None:
        self.db = db

    async def save_message(
        self,
        task_id: str,
        module_id: str,
        sender: str,
        content: str,
        msg_type: str,
        references: List[str] = [],
        metadata: Dict[str, Any] = {},
    ) -> int:
        """保存一条黑板消息。"""
        from sololab.models.orm import BlackboardMessage

        async with self.db() as session:
            record = BlackboardMessage(
                task_id=task_id,
                module_id=module_id,
                sender=sender,
                content=content,
                msg_type=msg_type,
                references=references,
                metadata_json=metadata,
            )
            session.add(record)
            await session.commit()
            await session.refresh(record)
            return record.id

    async def get_messages(
        self,
        task_id: str,
        msg_type: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict]:
        """获取指定任务的黑板消息。"""
        from sololab.models.orm import BlackboardMessage

        async with self.db() as session:
            stmt = (
                select(BlackboardMessage)
                .where(BlackboardMessage.task_id == task_id)
                .order_by(BlackboardMessage.created_at.asc())
                .limit(limit)
            )
            if msg_type:
                stmt = stmt.where(BlackboardMessage.msg_type == msg_type)

            result = await session.execute(stmt)
            records = result.scalars().all()
            return [
                {
                    "id": r.id,
                    "task_id": r.task_id,
                    "sender": r.sender,
                    "content": r.content,
                    "msg_type": r.msg_type,
                    "references": r.references or [],
                    "metadata": r.metadata_json or {},
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in records
            ]

    async def get_run_history(
        self, module_id: Optional[str] = None, limit: int = 20
    ) -> List[Dict]:
        """获取运行历史（按 task_id 分组）。"""
        from sololab.models.orm import BlackboardMessage

        async with self.db() as session:
            stmt = (
                select(
                    BlackboardMessage.task_id,
                    BlackboardMessage.module_id,
                    func.count(BlackboardMessage.id).label("message_count"),
                    func.min(BlackboardMessage.created_at).label("started_at"),
                    func.max(BlackboardMessage.created_at).label("ended_at"),
                )
                .group_by(BlackboardMessage.task_id, BlackboardMessage.module_id)
                .order_by(func.max(BlackboardMessage.created_at).desc())
                .limit(limit)
            )
            if module_id:
                stmt = stmt.where(BlackboardMessage.module_id == module_id)

            result = await session.execute(stmt)
            rows = result.fetchall()
            return [
                {
                    "task_id": row.task_id,
                    "module_id": row.module_id,
                    "message_count": row.message_count,
                    "started_at": row.started_at.isoformat() if row.started_at else None,
                    "ended_at": row.ended_at.isoformat() if row.ended_at else None,
                }
                for row in rows
            ]

    async def export_run_as_markdown(self, task_id: str) -> str:
        """将运行结果导出为 Markdown。"""
        messages = await self.get_messages(task_id)
        if not messages:
            return f"# Run {task_id}\n\nNo messages found."

        module_id = messages[0].get("module_id", "unknown")
        started = messages[0].get("created_at", "")
        ended = messages[-1].get("created_at", "")

        md = f"# Run Report: {task_id}\n\n"
        md += f"- **Module:** {module_id}\n"
        md += f"- **Started:** {started}\n"
        md += f"- **Ended:** {ended}\n"
        md += f"- **Total Messages:** {len(messages)}\n\n---\n\n"

        # 按类型分组
        ideas = [m for m in messages if m["msg_type"] == "idea"]
        critiques = [m for m in messages if m["msg_type"] == "critique"]
        syntheses = [m for m in messages if m["msg_type"] == "synthesis"]
        votes = [m for m in messages if m["msg_type"] == "vote"]

        if ideas:
            md += f"## Ideas ({len(ideas)})\n\n"
            for m in ideas:
                md += f"### [{m['sender']}]\n{m['content']}\n\n"

        if critiques:
            md += f"## Critiques ({len(critiques)})\n\n"
            for m in critiques:
                md += f"**{m['sender']}:** {m['content']}\n\n"

        if syntheses:
            md += f"## Syntheses ({len(syntheses)})\n\n"
            for m in syntheses:
                md += f"**{m['sender']}:** {m['content']}\n\n"

        if votes:
            md += f"## Votes ({len(votes)})\n\n"
            for m in votes:
                md += f"- {m['sender']}: {m['content'][:200]}\n"

        return md
