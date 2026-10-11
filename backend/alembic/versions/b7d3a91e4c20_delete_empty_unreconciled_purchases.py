"""delete empty unreconciled purchases

Revision ID: b7d3a91e4c20
Revises: 9c4e71d0b2a5
Create Date: 2026-10-11 12:50:00.000000

Deleting an item used to leave its trip behind when it was the last one in
the cart. Once torn off, such a trip shows in the history as a purchase with
no lines. Nobody wrote these down (closed_at is NULL), no receipt names them,
and no item points at them, so they hold nothing to keep.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7d3a91e4c20"
down_revision: str | Sequence[str] | None = "9c4e71d0b2a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM purchases
        WHERE closed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM list_items WHERE list_items.purchase_id = purchases.id)
          AND NOT EXISTS (SELECT 1 FROM receipt_scans WHERE receipt_scans.purchase_id = purchases.id)
        """
    )


def downgrade() -> None:
    # The deleted rows held no data worth restoring.
    pass
