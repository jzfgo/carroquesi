"""add report_opt_outs

Revision ID: f30c04a9ac0e
Revises: 6cb2db34df07
Create Date: 2026-11-05 12:39:12.862339

One row per user who stopped the monthly report for one list.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f30c04a9ac0e"
down_revision: str | Sequence[str] | None = "6cb2db34df07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "report_opt_outs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("list_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["list_id"], ["lists.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "list_id"),
    )


def downgrade() -> None:
    op.drop_table("report_opt_outs")
