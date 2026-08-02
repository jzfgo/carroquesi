"""add receipt file columns to receipt_scans

Revision ID: 58a62fa8dbe1
Revises: c60a03c1ddf2
Create Date: 2026-08-02 20:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "58a62fa8dbe1"
down_revision: str | Sequence[str] | None = "c60a03c1ddf2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the stored-receipt-file columns.

    All three are nullable adds — NULL means no upload URL was ever minted
    for the scan — so plain add_column works on SQLite and Postgres alike;
    no batch mode and no backfill.
    """
    op.add_column("receipt_scans", sa.Column("file_path", sa.String(), nullable=True))
    op.add_column("receipt_scans", sa.Column("file_content_type", sa.String(), nullable=True))
    op.add_column("receipt_scans", sa.Column("file_pages", sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("receipt_scans", "file_pages")
    op.drop_column("receipt_scans", "file_content_type")
    op.drop_column("receipt_scans", "file_path")
