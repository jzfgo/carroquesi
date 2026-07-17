"""add is_default to list_members

Revision ID: 40e24ab12eed
Revises: 4003ba7fddd1
Create Date: 2026-07-18 01:11:43.344015
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "40e24ab12eed"
down_revision: str | None = "4003ba7fddd1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "list_members",
        sa.Column(
            "is_default",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # One-time backfill: pin each existing user's default to their
    # most-recently-updated list — exactly where the old resolver would have sent
    # "default" the day before — so nothing moves on upgrade. Delegated to the
    # shared ORM helper so the same logic is unit-tested (the suite builds its
    # schema with create_all and never runs Alembic). Imported lazily to keep
    # module import cheap for offline history/autogenerate commands.
    from sqlmodel import Session

    from app.services.default_list import backfill_all_defaults

    with Session(bind=op.get_bind()) as session:
        backfill_all_defaults(session)
        session.commit()


def downgrade() -> None:
    op.drop_column("list_members", "is_default")
