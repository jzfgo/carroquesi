"""merge_receipt_and_feedback_heads

Revision ID: 7e594e817b43
Revises: a181ea7d6f6a, b6c7d8e9f0a1
Create Date: 2026-05-31 03:32:36.833375

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e594e817b43'
down_revision: Union[str, Sequence[str], None] = ('a181ea7d6f6a', 'b6c7d8e9f0a1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
