"""add reduced price to list_items

Revision ID: 3ab2169c5968
Revises: b03a440d26d8
Create Date: 2026-11-12 18:00:00.000000

A line's price can come from a reduced label. price_reduced says so;
price_before is the price the label had before, in the same basis as
price (€/kg on a weighed line), when someone copied it.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3ab2169c5968"
down_revision: str | Sequence[str] | None = "b03a440d26d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "list_items",
        sa.Column("price_reduced", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("list_items", sa.Column("price_before", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("list_items", "price_before")
    op.drop_column("list_items", "price_reduced")
