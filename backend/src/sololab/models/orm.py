"""SQLAlchemy ORM 模型 - Phase 3 数据表定义。"""

from datetime import datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(AsyncAttrs, DeclarativeBase):
    """SQLAlchemy 声明式基类。"""
    pass


class MemoryRecord(Base):
    """记忆存储表 - pgvector 向量搜索。"""
    __tablename__ = "memories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = mapped_column(Vector(1536), nullable=True)  # OpenAI text-embedding-3-small dimension
    scope: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # module|session|project|global
    scope_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)  # module_id / session_id / project_id
    metadata_json: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True, default={})
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_memories_scope_scope_id", "scope", "scope_id"),
    )


class DocumentRecord(Base):
    """文档记录表。"""
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    doc_type: Mapped[str] = mapped_column(String(20), nullable=False, default="pdf")
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    authors: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)  # List[str] as JSON
    abstract: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    keywords: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)  # List[str] as JSON
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_pages: Mapped[int] = mapped_column(Integer, default=0)
    total_chunks: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending|processing|completed|failed
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    project_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    raw_markdown: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationship
    chunks: Mapped[list["DocumentChunkRecord"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class DocumentChunkRecord(Base):
    """文档分块表 - 带向量嵌入。"""
    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.doc_id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(20), default="text")  # text|table|formula|caption
    embedding = mapped_column(Vector(1536), nullable=True)
    page_numbers: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True, default=[])
    metadata_json: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True, default={})
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    document: Mapped["DocumentRecord"] = relationship(back_populates="chunks")


class SessionRecord(Base):
    """会话记录表。"""
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    module_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True, default={})
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|archived|deleted
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationship
    messages: Mapped[list["SessionMessageRecord"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class SessionMessageRecord(Base):
    """会话消息表。"""
    __tablename__ = "session_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user|assistant|system|tool
    content: Mapped[str] = mapped_column(Text, nullable=False)
    module_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True, default={})
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    session: Mapped["SessionRecord"] = relationship(back_populates="messages")


class CostRecord(Base):
    """费用记录表。"""
    __tablename__ = "cost_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    module_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# Database engine factory
def create_db_engine(database_url: str):
    """创建异步数据库引擎。"""
    return create_async_engine(database_url, echo=False, pool_size=10, max_overflow=20)


def create_session_factory(engine):
    """创建异步会话工厂。"""
    return async_sessionmaker(engine, expire_on_commit=False)
