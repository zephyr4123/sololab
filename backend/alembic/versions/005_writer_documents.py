"""Add writer_documents table for WriterAI module

Revision ID: 005
Revises: 004
Create Date: 2026-04-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "writer_documents",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("doc_id", sa.String(36), nullable=False),
        sa.Column("session_id", sa.String(36), nullable=False),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("template_id", sa.String(64), nullable=False, server_default="nature"),
        sa.Column("language", sa.String(10), nullable=False, server_default="en"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("sections", JSONB(), nullable=False, server_default="[]"),
        sa.Column("references", JSONB(), nullable=False, server_default="[]"),
        sa.Column("figures", JSONB(), nullable=False, server_default="[]"),
        sa.Column("metadata_json", JSONB(), nullable=True, server_default="{}"),
        sa.Column("word_count", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("doc_id"),
    )
    op.create_index("ix_writer_documents_doc_id", "writer_documents", ["doc_id"])
    op.create_index("ix_writer_documents_session_id", "writer_documents", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_writer_documents_session_id", table_name="writer_documents")
    op.drop_index("ix_writer_documents_doc_id", table_name="writer_documents")
    op.drop_table("writer_documents")
