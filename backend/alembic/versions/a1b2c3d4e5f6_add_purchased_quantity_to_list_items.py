"""add purchased_quantity to list_items

Revision ID: a1b2c3d4e5f6
Revises: 7e594e817b43
Create Date: 2026-05-31 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "7e594e817b43"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "list_items",
        sa.Column("purchased_quantity", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("list_items", "purchased_quantity")
