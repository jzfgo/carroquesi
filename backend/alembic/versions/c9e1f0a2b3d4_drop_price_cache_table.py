"""drop price_cache table

The community price feature is removed, and nothing reads this table
anymore. Its rows are a TTL'd cache of Open Prices responses, so the
data is refetchable from the source; dropping it loses nothing that
cannot be rebuilt.

Revision ID: c9e1f0a2b3d4
Revises: 45e4c812fc12
Create Date: 2026-08-02 15:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9e1f0a2b3d4"
down_revision: str | Sequence[str] | None = "45e4c812fc12"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_index(op.f("ix_price_cache_ean"), table_name="price_cache")
    op.drop_table("price_cache")


def downgrade() -> None:
    """Downgrade schema.

    Recreates the table empty, in its final shape: as created by
    e5f6a7b8c9d0 with the nullable amount from 5ecb72b18efe. The cached
    rows are gone, but the cache repopulates itself on use.
    """
    op.create_table(
        "price_cache",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("ean", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=True),
        sa.Column("price_per", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_price_cache_ean"), "price_cache", ["ean"], unique=True)
