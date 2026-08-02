"""index receipt_scans purchase_id

The purchase history page derives has_receipt by looking up scans by
trip, so the column is queried now. Postgres does not index FK columns
on its own.

Revision ID: 84037d754ce2
Revises: c9e1f0a2b3d4
Create Date: 2026-08-02 19:09:19.232261

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "84037d754ce2"
down_revision: str | Sequence[str] | None = "c9e1f0a2b3d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        op.f("ix_receipt_scans_purchase_id"), "receipt_scans", ["purchase_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_receipt_scans_purchase_id"), table_name="receipt_scans")
