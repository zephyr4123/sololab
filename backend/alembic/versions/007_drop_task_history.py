"""Drop unused task_history table.

The table was created in 001 but never queried — task state lives in Redis
(see core/task_state_manager.py). Removed as part of the backend cleanup pass.

Revision ID: 007
Revises: 006
Create Date: 2026-05-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("task_history")


def downgrade() -> None:
    op.create_table(
        "task_history",
        sa.Column("task_id", sa.String(36), primary_key=True),
        sa.Column("module_id", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("request_json", sa.Text, nullable=True),
        sa.Column("result_json", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
