"""add quantity to barcode_cache

Revision ID: c3a7f19e5b20
Revises: b4d8e2f61a93
Create Date: 2026-11-16 10:00:00.000000

The package size Open Food Facts gives for a code («1,5 l», «6 x 33 cl»).
Rows cached before this never asked for it, so they are dropped: the cache
only saves a lookup, and the next scan of each code fetches it again.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3a7f19e5b20"
down_revision: str | Sequence[str] | None = "b4d8e2f61a93"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "barcode_cache",
        sa.Column("quantity", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.execute("DELETE FROM barcode_cache")


def downgrade() -> None:
    op.drop_column("barcode_cache", "quantity")
