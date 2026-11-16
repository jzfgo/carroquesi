"""add pack_source to list_items

Revision ID: b4d8e2f61a93
Revises: 7c1e5a9d2f40
Create Date: 2026-11-15 22:00:00.000000

Where a line's format came from. Every format stored so far was typed by
hand, so existing ones are "manual" and no guess will replace them.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4d8e2f61a93"
down_revision: str | Sequence[str] | None = "7c1e5a9d2f40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "list_items",
        sa.Column("pack_source", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.execute(
        "UPDATE list_items SET pack_source = 'manual' "
        "WHERE pack_count IS NOT NULL OR pack_content IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("list_items", "pack_source")
