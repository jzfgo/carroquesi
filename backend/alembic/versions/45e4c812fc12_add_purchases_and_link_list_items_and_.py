"""add purchases and link list_items and receipt_scans

Revision ID: 45e4c812fc12
Revises: 88134f3d9290
Create Date: 2026-08-02 13:37:25.797394

Backfills a synthetic `Purchase` per (list_id, Madrid local day) group of
already-purchased `list_items`. Done in Python, not SQL: "the Madrid local day
of a naive-UTC timestamp" has no portable SQL spelling, and grouping on the
UTC day instead would silently split or merge trips at the boundary — a late
evening shop in Spain reads as the next UTC day.

Madrid is a backfill-only choice. The live rule (app.services.trips) takes the
timezone from the caller, per ADR-012; these historical rows predate any
client declaration and every existing user is in Spain, so Madrid is the
honest zone for them. The arithmetic is duplicated here rather than imported:
a migration must keep meaning what it meant the day it ran, even if the app's
trip-boundary policy changes later — importing the live module would let a
future policy change silently rewrite what this backfill computed.
"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "45e4c812fc12"
down_revision: str | Sequence[str] | None = "88134f3d9290"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# See module docstring: backfill-only, deliberately not imported from
# app.services.trips.
BACKFILL_TIMEZONE = ZoneInfo("Europe/Madrid")


def _tears_off_at_for(instant: datetime) -> datetime:
    """Naive-UTC instant of the local midnight after `instant`'s Madrid day.

    Mirrors app.services.trips.tears_off_at_for exactly, on purpose — see the
    module docstring for why this is a duplicate rather than an import.
    """
    local = instant.replace(tzinfo=UTC).astimezone(BACKFILL_TIMEZONE)
    next_midnight = datetime.combine(
        local.date() + timedelta(days=1),
        datetime.min.time(),
        tzinfo=BACKFILL_TIMEZONE,
    )
    return next_midnight.astimezone(UTC).replace(tzinfo=None)


def _as_datetime(value: datetime | str) -> datetime:
    """Normalize a DateTime column read via raw SQL.

    SQLite hands back the column's stored string through the DBAPI when read
    via a raw `sa.text()` execute; Postgres hands back a real `datetime`
    already. Route both through here rather than assuming one or the other.
    """
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value)


def upgrade() -> None:
    """Upgrade schema and backfill synthetic trips."""
    op.create_table(
        "purchases",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("list_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("opened_at", sa.DateTime(), nullable=False),
        sa.Column("tears_off_at", sa.DateTime(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("store", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("total", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["list_id"], ["lists.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_purchases_list_id"), "purchases", ["list_id"], unique=False)
    # Partial unique index: at most one open (closed_at IS NULL) trip per
    # (list_id, tears_off_at). Mirrors Purchase.__table_args__ exactly — name,
    # columns, and predicate on both dialects, since tests build the schema
    # straight from the models via create_all and would silently diverge from
    # this migration otherwise. Partial indexes work on SQLite 3.8+ and
    # Postgres, so no dialect branch is needed here.
    op.create_index(
        "uq_purchases_open_per_list",
        "purchases",
        ["list_id", "tears_off_at"],
        unique=True,
        sqlite_where=sa.text("closed_at IS NULL"),
        postgresql_where=sa.text("closed_at IS NULL"),
    )

    # Plain add_column, then a dialect branch for the FK constraint itself.
    # Alembic's add_column always issues a *separate* ADD CONSTRAINT for any
    # FK attached to the column, and SQLite refuses that outside batch mode.
    # Batch mode was rejected rather than reached for: batch recreates the
    # table from *reflection*, and migration 465041cfdecb's docstring records
    # that receipt_scans.receipt_at reflects as a distinct DATE type on
    # SQLite — wrapping this add in batch_alter_table("receipt_scans") would
    # walk straight into the same type-drift corruption warned about there.
    # So on SQLite these two columns simply don't get an FK constraint at the
    # DB level. That's a deliberate gap, not an oversight:
    #   - nothing in this app sets `PRAGMA foreign_keys=ON`, so SQLite never
    #     enforced these FKs anyway, migration or not;
    #   - Postgres (the only place a violation could occur) gets the
    #     constraint below;
    #   - the schema-drift test in test_migrations.py is scoped to table and
    #     column names for exactly this reason and says so in a comment.
    op.add_column(
        "list_items",
        sa.Column("purchase_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.create_index(op.f("ix_list_items_purchase_id"), "list_items", ["purchase_id"], unique=False)

    op.add_column(
        "receipt_scans",
        sa.Column("purchase_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    # Unindexed on purpose, matching ReceiptScan.purchase_id — nothing queries
    # scans by trip yet.

    if op.get_bind().dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_list_items_purchase_id_purchases",
            "list_items",
            "purchases",
            ["purchase_id"],
            ["id"],
        )
        op.create_foreign_key(
            "fk_receipt_scans_purchase_id_purchases",
            "receipt_scans",
            "purchases",
            ["purchase_id"],
            ["id"],
        )

    _backfill_trips()


def _backfill_trips() -> None:
    """Group already-purchased list_items into synthetic Purchase rows.

    One trip per (list_id, Madrid local day of purchased_at). Per trip:
      - opened_at    = earliest purchased_at in the group
      - tears_off_at = the Madrid midnight after that day
      - closed_at    = NULL — nobody closed these by hand, and saying
                       otherwise would fabricate a fact that never happened
      - store        = the group's single distinct price_store, else NULL
      - total        = NULL, always. A confirmed total that was never
                       confirmed is exactly what this column exists not to be.

    Runs on the migration's own connection, inside the same transaction as
    the DDL above, so a failure here rolls the whole revision back.
    """
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, list_id, purchased_at, price_store FROM list_items "
            "WHERE purchased_at IS NOT NULL"
        )
    ).fetchall()

    groups: dict[tuple[str, datetime], list[tuple[str, datetime, str | None]]] = {}
    for row in rows:
        purchased_at = _as_datetime(row.purchased_at)
        tears_off_at = _tears_off_at_for(purchased_at)
        groups.setdefault((row.list_id, tears_off_at), []).append(
            (row.id, purchased_at, row.price_store)
        )

    for (list_id, tears_off_at), items in groups.items():
        opened_at = min(purchased_at for _, purchased_at, _ in items)
        distinct_stores = {store for _, _, store in items if store is not None}
        store = distinct_stores.pop() if len(distinct_stores) == 1 else None
        purchase_id = str(uuid.uuid4())

        conn.execute(
            sa.text(
                "INSERT INTO purchases "
                "(id, list_id, opened_at, tears_off_at, closed_at, store, total) "
                "VALUES (:id, :list_id, :opened_at, :tears_off_at, NULL, :store, NULL)"
            ),
            {
                "id": purchase_id,
                "list_id": list_id,
                "opened_at": opened_at,
                "tears_off_at": tears_off_at,
                "store": store,
            },
        )
        conn.execute(
            sa.text(
                "UPDATE list_items SET purchase_id = :purchase_id WHERE id IN :item_ids"
            ).bindparams(sa.bindparam("item_ids", expanding=True)),
            {"purchase_id": purchase_id, "item_ids": [item_id for item_id, _, _ in items]},
        )


def downgrade() -> None:
    """Downgrade schema. The backfilled purchases rows go with the table."""
    if op.get_bind().dialect.name != "sqlite":
        op.drop_constraint(
            "fk_receipt_scans_purchase_id_purchases", "receipt_scans", type_="foreignkey"
        )
        op.drop_constraint("fk_list_items_purchase_id_purchases", "list_items", type_="foreignkey")

    op.drop_column("receipt_scans", "purchase_id")

    op.drop_index(op.f("ix_list_items_purchase_id"), table_name="list_items")
    op.drop_column("list_items", "purchase_id")

    op.drop_index("uq_purchases_open_per_list", table_name="purchases")
    op.drop_index(op.f("ix_purchases_list_id"), table_name="purchases")
    op.drop_table("purchases")
