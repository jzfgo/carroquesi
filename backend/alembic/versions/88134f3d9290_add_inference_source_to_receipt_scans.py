"""add inference_source to receipt_scans

Revision ID: 88134f3d9290
Revises: 984ed3277995
Create Date: 2026-08-01 23:35:27.076004

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "88134f3d9290"
down_revision: str | Sequence[str] | None = "984ed3277995"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "receipt_scans",
        sa.Column("inference_source", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("receipt_scans", "inference_source")
