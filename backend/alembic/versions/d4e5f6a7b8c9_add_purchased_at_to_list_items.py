"""add purchased_at to list_items

Revision ID: d4e5f6a7b8c9
Revises: 661153072156
Create Date: 2026-04-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = '661153072156'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add purchased_at as nullable so existing rows are not rejected
    op.add_column(
        'list_items',
        sa.Column('purchased_at', sa.DateTime(), nullable=True),
    )
    # 2. Backfill: use updated_at as a proxy for purchase time on already-purchased rows
    op.execute(
        "UPDATE list_items SET purchased_at = updated_at WHERE purchased = true"
    )
    # 3. Drop the old boolean column
    op.drop_column('list_items', 'purchased')


def downgrade() -> None:
    op.add_column(
        'list_items',
        sa.Column('purchased', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.execute(
        "UPDATE list_items SET purchased = true WHERE purchased_at IS NOT NULL"
    )
    op.drop_column('list_items', 'purchased_at')
