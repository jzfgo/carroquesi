"""make_price_cache_amount_nullable

Revision ID: 5ecb72b18efe
Revises: f7a8b9c0d1e2
Create Date: 2026-04-14 00:17:39.474282

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '5ecb72b18efe'
down_revision: Union[str, Sequence[str], None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('price_cache') as batch_op:
        batch_op.alter_column('amount',
                   existing_type=sa.FLOAT(),
                   nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    # Purge negative-cache entries (amount=NULL) before restoring NOT NULL constraint
    op.execute("DELETE FROM price_cache WHERE amount IS NULL")
    with op.batch_alter_table('price_cache') as batch_op:
        batch_op.alter_column('amount',
                   existing_type=sa.FLOAT(),
                   nullable=False)
