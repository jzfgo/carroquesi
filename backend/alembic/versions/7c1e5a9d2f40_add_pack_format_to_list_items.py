"""add pack format to list_items

Revision ID: 7c1e5a9d2f40
Revises: 3ab2169c5968
Create Date: 2026-11-15 21:00:00.000000

A line's pack format: 6 × 1,5 L is count 6, content 1,5, unit "l". All
nullable: existing lines have no format and keep reading their quantity.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c1e5a9d2f40"
down_revision: str | Sequence[str] | None = "3ab2169c5968"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("list_items", sa.Column("pack_count", sa.Integer(), nullable=True))
    op.add_column("list_items", sa.Column("pack_content", sa.Float(), nullable=True))
    op.add_column(
        "list_items",
        sa.Column("pack_content_unit", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("list_items", "pack_content_unit")
    op.drop_column("list_items", "pack_content")
    op.drop_column("list_items", "pack_count")
