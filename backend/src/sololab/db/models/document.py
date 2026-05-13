"""Uploaded reference documents and their RAG chunks."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sololab.db.base import Base

_EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1024"))


class DocumentRecord(Base):
    """Uploaded document — typically a PDF that was parsed into chunks."""

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    doc_type: Mapped[str] = mapped_column(String(20), nullable=False, default="pdf")
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    authors: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    abstract: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    keywords: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_pages: Mapped[int] = mapped_column(Integer, default=0)
    total_chunks: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    project_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    file_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    raw_markdown: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    chunks: Mapped[list["DocumentChunkRecord"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class DocumentChunkRecord(Base):
    """Vector-indexed chunk of a parsed document."""

    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("documents.doc_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(20), default="text")
    embedding = mapped_column(Vector(_EMBEDDING_DIM), nullable=True)
    page_numbers: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True, default=list)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    document: Mapped[DocumentRecord] = relationship(back_populates="chunks")
