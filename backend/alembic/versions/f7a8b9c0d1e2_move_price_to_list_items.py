"""move price fields to list_items, drop price_records

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-04-09 00:00:00.000000
"""
from typing import Sequence, Union
from datetime import datetime, timezone
import uuid

import sqlmodel
from alembic import op
import sqlalchemy as sa

revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('list_items', sa.Column('price', sa.Float(), nullable=True))
    op.add_column('list_items', sa.Column('price_per', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('list_items', sa.Column('price_store', sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    # Migrate data: copy the latest price record per item into the new columns.
    # Uses correlated subqueries — compatible with both SQLite (tests) and PostgreSQL (prod).
    op.execute(sa.text("""
        UPDATE list_items
        SET
            price = (
                SELECT amount FROM price_records
                WHERE list_item_id = list_items.id
                ORDER BY recorded_at DESC LIMIT 1
            ),
            price_per = (
                SELECT price_per FROM price_records
                WHERE list_item_id = list_items.id
                ORDER BY recorded_at DESC LIMIT 1
            ),
            price_store = (
                SELECT store FROM price_records
                WHERE list_item_id = list_items.id
                ORDER BY recorded_at DESC LIMIT 1
            )
        WHERE id IN (SELECT DISTINCT list_item_id FROM price_records)
    """))

    op.drop_index('ix_price_records_list_item_id', table_name='price_records')
    op.drop_table('price_records')


def downgrade() -> None:
    op.create_table(
        'price_records',
        sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('list_item_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('ean', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('price_per', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('store', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('user_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['list_item_id'], ['list_items.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_price_records_list_item_id', 'price_records', ['list_item_id'])

    # Restore data using Python-side UUID generation (cross-database compatible).
    # Uses added_by as user_id since the original recorder is no longer tracked.
    # Note: only the latest price is restored — historical records are not recoverable.
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT id, ean, price, price_per, price_store, added_by FROM list_items WHERE price IS NOT NULL"
    )).fetchall()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for row in rows:
        bind.execute(
            sa.text(
                "INSERT INTO price_records "
                "(id, list_item_id, ean, amount, price_per, store, user_id, recorded_at) "
                "VALUES (:id, :list_item_id, :ean, :amount, :price_per, :store, :user_id, :recorded_at)"
            ),
            {
                "id": str(uuid.uuid4()),
                "list_item_id": row.id,
                "ean": row.ean,
                "amount": row.price,
                "price_per": row.price_per,
                "store": row.price_store,
                "user_id": row.added_by,
                "recorded_at": now,
            }
        )

    op.drop_column('list_items', 'price_store')
    op.drop_column('list_items', 'price_per')
    op.drop_column('list_items', 'price')
