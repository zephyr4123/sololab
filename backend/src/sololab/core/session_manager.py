"""会话管理器 - 用户会话生命周期管理。"""

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, select, update, func
from sqlalchemy.ext.asyncio import async_sessionmaker

logger = logging.getLogger(__name__)


class SessionManager:
    """管理用户会话和跨模块上下文。

    功能：
    - 创建/获取/列出/删除会话
    - 消息历史持久化
    - 跨模块会话上下文共享
    """

    def __init__(self, db: async_sessionmaker) -> None:
        self.db = db

    async def create_session(
        self,
        title: Optional[str] = None,
        module_id: Optional[str] = None,
        metadata: Dict[str, Any] = {},
    ) -> str:
        """创建新会话，返回 session_id。"""
        from sololab.models.orm import SessionRecord

        session_id = str(uuid.uuid4())
        async with self.db() as session:
            record = SessionRecord(
                session_id=session_id,
                title=title or f"Session {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
                module_id=module_id,
                metadata_json=metadata,
                status="active",
            )
            session.add(record)
            await session.commit()
            logger.info("会话已创建: session_id=%s, module=%s", session_id, module_id)
            return session_id

    async def get_session(self, session_id: str) -> Optional[dict]:
        """获取会话状态。"""
        from sololab.models.orm import SessionRecord

        async with self.db() as session:
            result = await session.execute(
                select(SessionRecord).where(SessionRecord.session_id == session_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                return None
            return {
                "session_id": record.session_id,
                "title": record.title,
                "module_id": record.module_id,
                "metadata": record.metadata_json or {},
                "status": record.status,
                "created_at": record.created_at.isoformat() if record.created_at else None,
                "updated_at": record.updated_at.isoformat() if record.updated_at else None,
            }

    async def list_sessions(
        self, limit: int = 20, module_id: Optional[str] = None, status: str = "active"
    ) -> List[dict]:
        """列出最近的会话。"""
        from sololab.models.orm import SessionRecord

        async with self.db() as session:
            stmt = (
                select(SessionRecord)
                .where(SessionRecord.status == status)
                .order_by(SessionRecord.updated_at.desc())
                .limit(limit)
            )
            if module_id:
                stmt = stmt.where(SessionRecord.module_id == module_id)

            result = await session.execute(stmt)
            records = result.scalars().all()
            return [
                {
                    "session_id": r.session_id,
                    "title": r.title,
                    "module_id": r.module_id,
                    "status": r.status,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                }
                for r in records
            ]

    async def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        module_id: Optional[str] = None,
        metadata: Dict[str, Any] = {},
        tokens_used: int = 0,
        cost_usd: float = 0.0,
    ) -> int:
        """添加消息到会话历史。"""
        from sololab.models.orm import SessionMessageRecord, SessionRecord

        async with self.db() as session:
            msg = SessionMessageRecord(
                session_id=session_id,
                role=role,
                content=content,
                module_id=module_id,
                metadata_json=metadata,
                tokens_used=tokens_used,
                cost_usd=cost_usd,
            )
            session.add(msg)
            # 更新会话的 updated_at
            await session.execute(
                update(SessionRecord)
                .where(SessionRecord.session_id == session_id)
                .values(updated_at=func.now())
            )
            await session.commit()
            await session.refresh(msg)
            return msg.id

    async def get_history(
        self, session_id: str, limit: int = 100, offset: int = 0
    ) -> List[dict]:
        """获取会话消息历史。"""
        from sololab.models.orm import SessionMessageRecord

        async with self.db() as session:
            result = await session.execute(
                select(SessionMessageRecord)
                .where(SessionMessageRecord.session_id == session_id)
                .order_by(SessionMessageRecord.created_at.asc())
                .offset(offset)
                .limit(limit)
            )
            records = result.scalars().all()
            return [
                {
                    "id": r.id,
                    "role": r.role,
                    "content": r.content,
                    "module_id": r.module_id,
                    "metadata": r.metadata_json or {},
                    "tokens_used": r.tokens_used,
                    "cost_usd": r.cost_usd,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in records
            ]

    async def get_context_messages(
        self, session_id: str, max_messages: int = 20
    ) -> List[Dict[str, str]]:
        """获取用于 LLM 上下文的消息列表（OpenAI 格式）。

        返回最近 N 条消息，格式为 [{"role": "user", "content": "..."}]
        对于 assistant 消息，如果 content 为空但有 events metadata，
        则从 done 事件的 top_ideas 中提取**完整**创意内容。
        """
        history = await self.get_history(session_id, limit=max_messages)
        result = []
        for m in history:
            role = m["role"]
            content = m["content"]

            # assistant 消息可能 content 为空，关键信息在 metadata.events 中
            if role == "assistant" and not content.strip():
                events = (m.get("metadata") or {}).get("events", [])
                if events:
                    # 优先从 done 事件提取完整的 top ideas（这是最重要的结论）
                    done_event = next(
                        (e for e in reversed(events) if e.get("type") == "done"),
                        None,
                    )
                    if done_event and done_event.get("top_ideas"):
                        top_ideas = done_event["top_ideas"]
                        parts = []
                        for i, idea in enumerate(top_ideas, 1):
                            author = idea.get("author", "")
                            score = idea.get("elo_score", 0)
                            # 完整保留创意内容，不截断
                            idea_content = idea.get("content", "")
                            parts.append(
                                f"### 排名 {i} (来自{author}, Elo={score})\n{idea_content}"
                            )
                        content = "上一轮生成的 Top 研究创意：\n\n" + "\n\n".join(parts)
                    else:
                        # 降级：从 vote 事件提取
                        vote_parts = []
                        for event in events:
                            if event.get("type") == "vote":
                                vote_parts.append(
                                    f"排名{event.get('rank')}: {event.get('content', '')}"
                                )
                        content = "\n".join(vote_parts) if vote_parts else "[生成结果已保存]"

            if content:
                result.append({"role": role, "content": content})

        return result

    async def delete_session(self, session_id: str) -> bool:
        """删除会话（软删除，标记为 deleted）。"""
        from sololab.models.orm import SessionRecord

        async with self.db() as session:
            result = await session.execute(
                update(SessionRecord)
                .where(SessionRecord.session_id == session_id)
                .values(status="deleted", updated_at=func.now())
            )
            await session.commit()
            deleted = result.rowcount > 0
            if deleted:
                logger.info("会话已删除: session_id=%s", session_id)
            return deleted

    async def archive_session(self, session_id: str) -> bool:
        """归档会话。"""
        from sololab.models.orm import SessionRecord

        async with self.db() as session:
            result = await session.execute(
                update(SessionRecord)
                .where(SessionRecord.session_id == session_id)
                .values(status="archived", updated_at=func.now())
            )
            await session.commit()
            return result.rowcount > 0
