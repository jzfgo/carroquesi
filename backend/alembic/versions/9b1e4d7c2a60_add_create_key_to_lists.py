"""add create_key to lists

Revision ID: 9b1e4d7c2a60
Revises: c3a7f19e5b20
Create Date: 2026-11-17 16:00:00.000000

The Idempotency-Key of the request that created a list, unique per owner, so
a retried create returns the first list instead of making a second. A unique
index rather than a constraint: SQLite can add an index without batch mode,
and batch mode rebuilds the table from reflection.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9b1e4d7c2a60"
down_revision: str | Sequence[str] | None = "c3a7f19e5b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "lists",
        sa.Column("create_key", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.create_index(
        "ix_lists_owner_id_create_key", "lists", ["owner_id", "create_key"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_lists_owner_id_create_key", table_name="lists")
    op.drop_column("lists", "create_key")
