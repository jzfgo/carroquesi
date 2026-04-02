"""list_items_store_to_stores

Revision ID: 661153072156
Revises: 146d45a041f1
Create Date: 2026-04-02 11:30:49.911470

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '661153072156'
down_revision: Union[str, Sequence[str], None] = '146d45a041f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add stores as nullable first so existing rows are not rejected
    op.add_column(
        'list_items',
        sa.Column('stores', sa.JSON(), nullable=True),
    )
    # 2. Backfill: single store → one-element list; NULL → empty list
    op.execute(
        "UPDATE list_items SET stores = json_build_array(store) WHERE store IS NOT NULL"
    )
    op.execute(
        "UPDATE list_items SET stores = '[]'::json WHERE store IS NULL"
    )
    # 3. Enforce NOT NULL now that every row has a value
    op.alter_column('list_items', 'stores', nullable=False)
    # 4. Drop the old column
    op.drop_column('list_items', 'store')


def downgrade() -> None:
    op.add_column(
        'list_items',
        sa.Column('store', sa.String(), nullable=True),
    )
    # Restore first element of array as the single store value
    op.execute(
        "UPDATE list_items SET store = stores->>0 WHERE json_array_length(stores) > 0"
    )
    op.drop_column('list_items', 'stores')
