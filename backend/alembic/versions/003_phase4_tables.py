"""Phase 4: blackboard_messages + API keys

Revision ID: 003
Revises: 002
Create Date: 2026-03-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- 黑板消息持久化表 --
    op.create_table(
        "blackboard_messages",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.String(36), nullable=False),
        sa.Column("module_id", sa.String(64), nullable=False),
        sa.Column("sender", sa.String(64), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("msg_type", sa.String(20), nullable=False),
        sa.Column("references", JSONB, nullable=True, server_default="[]"),
        sa.Column("metadata_json", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_blackboard_task_id", "blackboard_messages", ["task_id"])
    op.create_index("ix_blackboard_module_id", "blackboard_messages", ["module_id"])
    op.create_index("ix_blackboard_msg_type", "blackboard_messages", ["msg_type"])

    # -- API Key 表（用于 API 认证） --
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("key_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"])


def downgrade() -> None:
    op.drop_table("api_keys")
    op.drop_table("blackboard_messages")
