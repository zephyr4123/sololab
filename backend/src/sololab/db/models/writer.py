"""WriterAI document storage."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from sololab.db.base import Base


class WriterDocumentRecord(Base):
    """A single academic paper draft.

    Sections / references / figures / conversation are stored as JSONB on this
    row instead of normalised tables — the whole document is loaded and
    persisted atomically per turn, so a single-row layout reflects the access
    pattern exactly.
    """

    __tablename__ = "writer_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    template_id: Mapped[str] = mapped_column(String(64), nullable=False, default="nature")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    sections: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    references: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    figures: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    conversation: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
