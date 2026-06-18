"""list_items_store_to_stores

Revision ID: 661153072156
Revises: 146d45a041f1
Create Date: 2026-04-02 11:30:49.911470

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "661153072156"
down_revision: str | Sequence[str] | None = "146d45a041f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add stores as nullable first so existing rows are not rejected
    op.add_column(
        "list_items",
        sa.Column("stores", sa.JSON(), nullable=True),
    )
    # 2. Backfill: single store → one-element list; NULL → empty list
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        conn.execute(
            sa.text(
                "UPDATE list_items SET stores = json_array(store) WHERE store IS NOT NULL"
            )
        )
        conn.execute(
            sa.text("UPDATE list_items SET stores = json('[]') WHERE store IS NULL")
        )
    else:
        conn.execute(
            sa.text(
                "UPDATE list_items SET stores = json_build_array(store) WHERE store IS NOT NULL"
            )
        )
        conn.execute(
            sa.text("UPDATE list_items SET stores = '[]'::json WHERE store IS NULL")
        )
    # 3. Enforce NOT NULL now that every row has a value
    with op.batch_alter_table("list_items") as batch_op:
        batch_op.alter_column("stores", nullable=False)
    # 4. Drop the old column
    op.drop_column("list_items", "store")


def downgrade() -> None:
    op.add_column(
        "list_items",
        sa.Column("store", sa.String(), nullable=True),
    )
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        conn.execute(
            sa.text(
                "UPDATE list_items SET store = json_extract(stores, '$[0]') WHERE json_array_length(stores) > 0"
            )
        )
    else:
        conn.execute(
            "UPDATE list_items SET store = stores->>0 WHERE json_array_length(stores) > 0"
        )
    op.drop_column("list_items", "stores")
