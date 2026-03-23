"""Phase 3: memories, documents, sessions, cost records

Revision ID: 002
Revises: 001
Create Date: 2026-03-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- 记忆表 (pgvector) --
    op.create_table(
        "memories",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", sa.LargeBinary, nullable=True),  # pgvector Vector handled via raw SQL
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("scope_id", sa.String(64), nullable=True),
        sa.Column("metadata_json", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # Replace embedding column with proper vector type
    op.execute("ALTER TABLE memories DROP COLUMN embedding")
    op.execute("ALTER TABLE memories ADD COLUMN embedding vector(1536)")
    op.create_index("ix_memories_scope", "memories", ["scope"])
    op.create_index("ix_memories_scope_scope_id", "memories", ["scope", "scope_id"])
    # Create HNSW index for approximate nearest neighbor search
    op.execute("CREATE INDEX ix_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops)")

    # -- 文档表 --
    op.create_table(
        "documents",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("doc_id", sa.String(36), unique=True, nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(512), nullable=True),
        sa.Column("doc_type", sa.String(20), nullable=False, server_default="pdf"),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("authors", JSONB, nullable=True),
        sa.Column("abstract", sa.Text, nullable=True),
        sa.Column("keywords", JSONB, nullable=True),
        sa.Column("year", sa.Integer, nullable=True),
        sa.Column("total_pages", sa.Integer, server_default="0"),
        sa.Column("total_chunks", sa.Integer, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("project_id", sa.String(64), nullable=True),
        sa.Column("raw_markdown", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_documents_doc_id", "documents", ["doc_id"])
    op.create_index("ix_documents_project_id", "documents", ["project_id"])

    # -- 文档分块表 (pgvector) --
    op.create_table(
        "document_chunks",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("doc_id", sa.String(36), sa.ForeignKey("documents.doc_id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("content_type", sa.String(20), server_default="text"),
        sa.Column("embedding_placeholder", sa.LargeBinary, nullable=True),
        sa.Column("page_numbers", JSONB, nullable=True),
        sa.Column("metadata_json", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.execute("ALTER TABLE document_chunks DROP COLUMN embedding_placeholder")
    op.execute("ALTER TABLE document_chunks ADD COLUMN embedding vector(1536)")
    op.create_index("ix_document_chunks_doc_id", "document_chunks", ["doc_id"])
    op.execute("CREATE INDEX ix_doc_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops)")

    # -- 会话表 --
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.String(36), unique=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("module_id", sa.String(64), nullable=True),
        sa.Column("metadata_json", JSONB, nullable=True),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_sessions_session_id", "sessions", ["session_id"])
    op.create_index("ix_sessions_module_id", "sessions", ["module_id"])

    # -- 会话消息表 --
    op.create_table(
        "session_messages",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("module_id", sa.String(64), nullable=True),
        sa.Column("metadata_json", JSONB, nullable=True),
        sa.Column("tokens_used", sa.Integer, server_default="0"),
        sa.Column("cost_usd", sa.Float, server_default="0.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_session_messages_session_id", "session_messages", ["session_id"])

    # -- 费用记录表 --
    op.create_table(
        "cost_records",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.String(36), nullable=True),
        sa.Column("module_id", sa.String(64), nullable=True),
        sa.Column("session_id", sa.String(36), nullable=True),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("prompt_tokens", sa.Integer, server_default="0"),
        sa.Column("completion_tokens", sa.Integer, server_default="0"),
        sa.Column("cost_usd", sa.Float, server_default="0.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_cost_records_task_id", "cost_records", ["task_id"])
    op.create_index("ix_cost_records_module_id", "cost_records", ["module_id"])
    op.create_index("ix_cost_records_session_id", "cost_records", ["session_id"])


def downgrade() -> None:
    op.drop_table("cost_records")
    op.drop_table("session_messages")
    op.drop_table("sessions")
    op.drop_table("document_chunks")
    op.drop_table("documents")
    op.drop_table("memories")
