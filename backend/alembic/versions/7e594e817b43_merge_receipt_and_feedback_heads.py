"""merge_receipt_and_feedback_heads

Revision ID: 7e594e817b43
Revises: a181ea7d6f6a, b6c7d8e9f0a1
Create Date: 2026-05-31 03:32:36.833375

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "7e594e817b43"
down_revision: str | Sequence[str] | None = ("a181ea7d6f6a", "b6c7d8e9f0a1")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
