"""add list_stores registry

Revision ID: 984ed3277995
Revises: 79fd5e6e70de
Create Date: 2026-08-01 19:27:14.549486
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "984ed3277995"
down_revision: str | Sequence[str] | None = "79fd5e6e70de"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "list_stores",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("list_id", sa.String(), nullable=False),
        sa.Column("store_key", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["list_id"], ["lists.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("list_id", "store_key"),
    )

    # Seed each key's label from existing item data (most frequent raw
    # variant, tie: first seen). Delegated to the shared ORM helper so the
    # logic is unit-tested (the suite builds its schema with create_all and
    # never runs Alembic). Imported lazily to keep module import cheap for
    # offline history/autogenerate commands.
    from sqlmodel import Session

    from app.services.store_registry import backfill_list_stores

    with Session(bind=op.get_bind()) as session:
        backfill_list_stores(session)
        session.commit()


def downgrade() -> None:
    op.drop_table("list_stores")
