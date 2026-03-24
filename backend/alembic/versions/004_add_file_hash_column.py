"""Add file_hash column to documents table for SHA256 deduplication

Revision ID: 004
Revises: 003
Create Date: 2026-03-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 添加 file_hash 列（SHA256 去重）
    op.add_column("documents", sa.Column("file_hash", sa.String(64), nullable=True))
    op.create_index("ix_documents_file_hash", "documents", ["file_hash"])


def downgrade() -> None:
    op.drop_index("ix_documents_file_hash", table_name="documents")
    op.drop_column("documents", "file_hash")
