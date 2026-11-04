"""add report_runs and users.timezone

Revision ID: 3f8a2c61d9e4
Revises: b7d3a91e4c20
Create Date: 2026-11-04 18:00:00.000000

report_runs is the monthly report's send ledger, one row per list and
month. users.timezone keeps the zone each user's browser last declared, so
a scheduled run can cut the owner's month without a request to read it from.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3f8a2c61d9e4"
down_revision: str | Sequence[str] | None = "b7d3a91e4c20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("timezone", sa.String(), nullable=True))
    op.create_table(
        "report_runs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("list_id", sa.String(), nullable=False),
        sa.Column("period", sa.String(), nullable=False),
        sa.Column("timezone", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["list_id"], ["lists.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("list_id", "period"),
    )


def downgrade() -> None:
    op.drop_table("report_runs")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("timezone")
