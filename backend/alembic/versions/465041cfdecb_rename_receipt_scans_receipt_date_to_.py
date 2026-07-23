"""rename receipt_scans receipt_date to receipt_at

Revision ID: 465041cfdecb
Revises: 40e24ab12eed
Create Date: 2026-07-23 18:24:14.282879

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "465041cfdecb"
down_revision: str | None = "40e24ab12eed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _is_sqlite() -> bool:
    # get_context(), not get_bind(): the latter is None in offline mode, so
    # `alembic upgrade --sql` would blow up here instead of rendering a script.
    return op.get_context().dialect.name == "sqlite"


def upgrade() -> None:
    # Rename and widen in place so existing audit rows survive. Never let
    # autogenerate write this: it cannot tell a rename from a drop plus an add,
    # and emits the latter — silently discarding every recorded receipt date.
    #
    # DATE -> TIMESTAMP is lossless; existing rows land on midnight, which is
    # exactly what _parse_receipt_at() produces for a bare date today.
    if _is_sqlite():
        # Local dev runs on SQLite (wt.toml's post-start `migrate` hook), which
        # has no ALTER COLUMN ... TYPE. Rename only, deliberately:
        #  - SQLite declared types are advisory, so DATE vs DATETIME changes
        #    nothing about what can be stored.
        #  - SQLAlchemy picks the result processor from the *model*, not the
        #    column, and its SQLite DATETIME processor already parses the bare
        #    "2026-04-11" that existing rows hold.
        #  - Routing this through batch_alter_table with type_ would be actively
        #    destructive: batch mode recreates the table with an explicit
        #    CAST(receipt_date AS DATETIME), and SQLite casts "2026-04-11" to
        #    the integer 2026 — which then fails to parse on read.
        op.alter_column("receipt_scans", "receipt_date", new_column_name="receipt_at")
        return

    op.alter_column(
        "receipt_scans",
        "receipt_date",
        new_column_name="receipt_at",
        type_=sa.DateTime(),
        existing_type=sa.Date(),
        existing_nullable=True,
    )


def downgrade() -> None:
    # Lossy by nature: TIMESTAMP -> DATE truncates the time of day. The date
    # component survives, which is all the pre-migration code could read.
    if _is_sqlite():
        op.alter_column("receipt_scans", "receipt_at", new_column_name="receipt_date")
        return

    op.alter_column(
        "receipt_scans",
        "receipt_at",
        new_column_name="receipt_date",
        type_=sa.Date(),
        existing_type=sa.DateTime(),
        existing_nullable=True,
    )
