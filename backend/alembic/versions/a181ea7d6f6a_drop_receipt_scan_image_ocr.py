"""drop_receipt_scan_image_ocr

Revision ID: a181ea7d6f6a
Revises: d182b25f62a5
Create Date: 2026-05-27 17:13:39.428324

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a181ea7d6f6a'
down_revision: Union[str, Sequence[str], None] = 'd182b25f62a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("receipt_scans") as batch_op:
        batch_op.drop_column("image_path")
        batch_op.drop_column("ocr_raw")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("receipt_scans") as batch_op:
        batch_op.add_column(sa.Column("image_path", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("ocr_raw", sa.JSON(), nullable=True))
