"""记忆管理器 - 基于 pgvector 的多级记忆系统。"""

import logging
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


class MemoryScope(str, Enum):
    """记忆作用域层级。"""

    MODULE = "module"
    SESSION = "session"
    PROJECT = "project"
    GLOBAL = "global"


# 作用域层级（高 → 低），高级可读取低级
_SCOPE_HIERARCHY = [MemoryScope.GLOBAL, MemoryScope.PROJECT, MemoryScope.SESSION, MemoryScope.MODULE]


class MemoryChunk(BaseModel):
    """存储的记忆单元。"""

    id: Optional[int] = None
    content: str
    embedding: Optional[List[float]] = None
    scope: MemoryScope
    scope_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    similarity: float = 0.0
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class MemoryManager:
    """基于 pgvector 的多级记忆管理。

    作用域层级：
    GLOBAL → PROJECT → SESSION → MODULE
    每个作用域可以读取所有上级作用域的记忆。
    """

    def __init__(self, llm_gateway: Any, db: async_sessionmaker) -> None:
        self.llm_gateway = llm_gateway
        self.db = db

    async def store(
        self,
        content: str,
        scope: MemoryScope,
        scope_id: Optional[str] = None,
        metadata: Dict[str, Any] = {},
    ) -> int:
        """将内容及其向量嵌入存储到 pgvector。"""
        from sololab.models.orm import MemoryRecord

        # 生成嵌入向量
        embeddings = await self.llm_gateway.embed([content])
        embedding = embeddings[0]

        async with self.db() as session:
            record = MemoryRecord(
                content=content,
                embedding=embedding,
                scope=scope.value,
                scope_id=scope_id,
                metadata_json=metadata,
            )
            session.add(record)
            await session.commit()
            await session.refresh(record)
            logger.info("记忆已存储: id=%d, scope=%s", record.id, scope.value)
            return record.id

    async def retrieve(
        self,
        query: str,
        scope: MemoryScope,
        scope_id: Optional[str] = None,
        top_k: int = 5,
        include_parent_scopes: bool = True,
    ) -> List[MemoryChunk]:
        """通过向量相似度搜索检索相关记忆。

        支持跨作用域检索：如果 include_parent_scopes=True，
        会同时搜索当前作用域及所有上级作用域的记忆。
        """
        # 生成查询向量
        query_embeddings = await self.llm_gateway.embed([query])
        query_embedding = query_embeddings[0]
        embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

        # 确定搜索的作用域范围
        scopes_to_search = [scope.value]
        if include_parent_scopes:
            scope_idx = _SCOPE_HIERARCHY.index(scope)
            scopes_to_search = [s.value for s in _SCOPE_HIERARCHY[:scope_idx + 1]]

        async with self.db() as session:
            # 使用 pgvector 的余弦距离进行相似度搜索
            # cosine distance: 1 - cosine_similarity, 越小越相似
            scope_filter = ", ".join(f"'{s}'" for s in scopes_to_search)
            sql = text(f"""
                SELECT id, content, scope, scope_id, metadata_json, created_at,
                       1 - (embedding <=> :embedding::vector) AS similarity
                FROM memories
                WHERE scope IN ({scope_filter})
                  AND embedding IS NOT NULL
                ORDER BY embedding <=> :embedding::vector
                LIMIT :top_k
            """)

            result = await session.execute(
                sql, {"embedding": embedding_str, "top_k": top_k}
            )
            rows = result.fetchall()

            chunks = []
            for row in rows:
                chunks.append(
                    MemoryChunk(
                        id=row.id,
                        content=row.content,
                        scope=MemoryScope(row.scope),
                        scope_id=row.scope_id,
                        metadata=row.metadata_json or {},
                        similarity=float(row.similarity),
                        timestamp=row.created_at,
                    )
                )
            return chunks

    async def delete(self, memory_id: int) -> bool:
        """删除指定的记忆条目。"""
        from sololab.models.orm import MemoryRecord

        async with self.db() as session:
            result = await session.execute(
                delete(MemoryRecord).where(MemoryRecord.id == memory_id)
            )
            await session.commit()
            deleted = result.rowcount > 0
            if deleted:
                logger.info("记忆已删除: id=%d", memory_id)
            return deleted

    async def delete_by_scope(self, scope: MemoryScope, scope_id: Optional[str] = None) -> int:
        """按作用域批量删除记忆。"""
        from sololab.models.orm import MemoryRecord

        async with self.db() as session:
            stmt = delete(MemoryRecord).where(MemoryRecord.scope == scope.value)
            if scope_id:
                stmt = stmt.where(MemoryRecord.scope_id == scope_id)
            result = await session.execute(stmt)
            await session.commit()
            logger.info("批量删除记忆: scope=%s, scope_id=%s, count=%d", scope.value, scope_id, result.rowcount)
            return result.rowcount

    async def count(self, scope: Optional[MemoryScope] = None) -> int:
        """统计记忆数量。"""
        from sololab.models.orm import MemoryRecord

        async with self.db() as session:
            stmt = select(MemoryRecord.id)
            if scope:
                stmt = stmt.where(MemoryRecord.scope == scope.value)
            result = await session.execute(stmt)
            return len(result.all())
