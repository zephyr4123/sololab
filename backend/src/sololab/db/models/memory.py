"""Vector memory store backed by pgvector."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from sololab.db.base import Base

# Embedding dimension is read once at import time. Changing the embedding model
# means recreating the column type — see docs/migrations.md.
_EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1024"))


class MemoryRecord(Base):
    """Vector-indexed memory entry."""

    __tablename__ = "memories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = mapped_column(Vector(_EMBEDDING_DIM), nullable=True)
    scope: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    scope_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (Index("ix_memories_scope_scope_id", "scope", "scope_id"),)
