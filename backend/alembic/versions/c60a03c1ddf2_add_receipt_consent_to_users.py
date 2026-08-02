"""add receipt consent to users

Revision ID: c60a03c1ddf2
Revises: 84037d754ce2
Create Date: 2026-08-02 20:18:55.630815

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c60a03c1ddf2"
down_revision: str | Sequence[str] | None = "84037d754ce2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the receipt-scanning consent columns.

    Both columns are nullable adds — NULL means the user was never asked —
    so plain add_column works on SQLite and Postgres alike; no batch mode
    and no backfill.
    """
    op.add_column("users", sa.Column("receipt_consent", sa.String(), nullable=True))
    op.add_column("users", sa.Column("receipt_consent_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "receipt_consent_at")
    op.drop_column("users", "receipt_consent")
