"""Actually run the Alembic migrations, instead of trusting create_all.

Every other test in this suite builds its schema with
`SQLModel.metadata.create_all(engine)` against an in-memory SQLite database
(see conftest.py) — that proves the *models* are internally consistent, but it
never executes a single line of alembic/versions/*.py. A broken migration, or
a migration that has drifted from the models it's supposed to produce, passes
that suite with flying colors and breaks the first time someone runs it for
real.

A file-based SQLite database is required here: the in-memory `StaticPool`
engine the rest of the suite uses does not survive Alembic's own connection
handling (each alembic operation can open/close connections against the
configured URL, and an in-memory sqlite:// database disappears the moment its
one connection closes).
"""

import uuid
from datetime import datetime
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from sqlmodel import SQLModel

from alembic import command
from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"

PRE_PURCHASES_REVISION = "7005338bb031"  # the revision just before ours


@pytest.fixture
def db_url(tmp_path: Path) -> str:
    # A real file, not sqlite:// — see module docstring for why.
    return f"sqlite:///{tmp_path / 'migrations.db'}"


@pytest.fixture
def alembic_config(db_url: str, monkeypatch: pytest.MonkeyPatch) -> Config:
    # env.py's `config.set_main_option("sqlalchemy.url", settings.database_url)`
    # (backend/alembic/env.py:11) reads the *settings singleton*, not whatever
    # is set on the Config object here — setting it on the Config alone is
    # silently ignored. Patch the singleton instead.
    monkeypatch.setattr(settings, "database_url", db_url)
    # Config(str(ALEMBIC_INI)) resolves script_location via alembic.ini's
    # `%(here)s` token relative to the ini file's own absolute path, so this
    # works regardless of the pytest invocation's cwd.
    return Config(str(ALEMBIC_INI))


def _engine(db_url: str) -> sa.Engine:
    return sa.create_engine(db_url)


def _insert_household(conn: sa.Connection, list_id: str) -> None:
    """Seed a users row and a lists row to satisfy list_items' FKs."""
    now = datetime(2026, 1, 1, 0, 0, 0)
    conn.execute(
        sa.text(
            "INSERT INTO users (id, firebase_uid, email, created_at) "
            "VALUES (:id, :uid, :email, :now)"
        ),
        {"id": "user-1", "uid": "uid-1", "email": "a@example.com", "now": now},
    )
    conn.execute(
        sa.text(
            "INSERT INTO lists (id, name, owner_id, created_at, updated_at) "
            "VALUES (:id, :name, :owner_id, :now, :now)"
        ),
        {"id": list_id, "name": "Household", "owner_id": "user-1", "now": now},
    )


def _insert_purchased_item(
    conn: sa.Connection,
    list_id: str,
    purchased_at: str,
    price_store: str | None = None,
    item_id: str | None = None,
) -> str:
    """Insert a purchased list_items row via raw SQL (pre-migration schema).

    Uses the ORM models here would be wrong: the point of this test is that
    the schema at PRE_PURCHASES_REVISION doesn't have `purchase_id` yet, and
    the models module only knows the *current* (post-migration) shape.
    """
    item_id = item_id or str(uuid.uuid4())
    now = datetime(2026, 1, 1, 0, 0, 0)
    conn.execute(
        sa.text(
            "INSERT INTO list_items "
            "(id, list_id, name, added_by, created_at, updated_at, stores, "
            " purchased_at, price_store) "
            "VALUES (:id, :list_id, :name, :added_by, :now, :now, :stores, "
            " :purchased_at, :price_store)"
        ),
        {
            "id": item_id,
            "list_id": list_id,
            "name": "Milk",
            "added_by": "user-1",
            "now": now,
            "stores": "[]",
            "purchased_at": purchased_at,
            "price_store": price_store,
        },
    )
    return item_id


def _insert_unpurchased_item(conn: sa.Connection, list_id: str) -> str:
    item_id = str(uuid.uuid4())
    now = datetime(2026, 1, 1, 0, 0, 0)
    conn.execute(
        sa.text(
            "INSERT INTO list_items "
            "(id, list_id, name, added_by, created_at, updated_at, stores) "
            "VALUES (:id, :list_id, :name, :added_by, :now, :now, '[]')"
        ),
        {"id": item_id, "list_id": list_id, "name": "Bread", "added_by": "user-1", "now": now},
    )
    return item_id


def test_upgrade_head_creates_purchases_table(alembic_config: Config, db_url: str) -> None:
    command.upgrade(alembic_config, "head")

    inspector = sa.inspect(_engine(db_url))
    assert "purchases" in inspector.get_table_names()


def test_schema_matches_models_after_upgrade(alembic_config: Config, db_url: str) -> None:
    """Reflect the migrated schema and compare it against the models.

    Scoped deliberately to table names and column names. Comparing constraint
    naming (FK constraint names, etc.) across dialects is a different, much
    noisier problem — SQLite and Postgres name and reflect constraints
    differently, and this migration's own list_items/receipt_scans FKs are
    intentionally absent on SQLite (see the migration's upgrade() comment) —
    so that is explicitly out of scope here.
    """
    command.upgrade(alembic_config, "head")

    inspector = sa.inspect(_engine(db_url))
    actual_tables = set(inspector.get_table_names()) - {"alembic_version"}
    expected_tables = set(SQLModel.metadata.tables.keys())
    assert actual_tables == expected_tables

    for table_name in expected_tables:
        actual_columns = {c["name"] for c in inspector.get_columns(table_name)}
        expected_columns = {c.name for c in SQLModel.metadata.tables[table_name].columns}
        assert actual_columns == expected_columns, f"column drift on {table_name}"

    # Load-bearing for the one-open-trip-per-list invariant (see
    # Purchase.__table_args__ / app.services.trips.trip_for) — a migration
    # that forgot this index would leave production unprotected while every
    # other assertion here still passed.
    index_names = {ix["name"] for ix in inspector.get_indexes("purchases")}
    assert "uq_purchases_open_per_list" in index_names


def test_downgrade_reverses_cleanly(alembic_config: Config, db_url: str) -> None:
    command.upgrade(alembic_config, "head")
    command.downgrade(alembic_config, "-1")

    inspector = sa.inspect(_engine(db_url))
    assert "purchases" not in inspector.get_table_names()
    list_items_columns = {c["name"] for c in inspector.get_columns("list_items")}
    assert "purchase_id" not in list_items_columns
    receipt_scans_columns = {c["name"] for c in inspector.get_columns("receipt_scans")}
    assert "purchase_id" not in receipt_scans_columns


def test_backfill_groups_by_madrid_local_day_not_utc_day(
    alembic_config: Config, db_url: str
) -> None:
    """The single most important test in this file.

    Both timestamps fall on 2026-07-28 in UTC. In Madrid (CEST, UTC+2) they
    land on *different* local days: 23:30 on the 28th, and 00:30 on the 29th.
    Grouping the backfill on the raw UTC date would merge these into one
    trip — silently, and permanently, since this backfill can only ever run
    once against real data.
    """
    command.upgrade(alembic_config, PRE_PURCHASES_REVISION)
    list_id = str(uuid.uuid4())
    engine = _engine(db_url)
    with engine.begin() as conn:
        _insert_household(conn, list_id)
        item_a = _insert_purchased_item(conn, list_id, "2026-07-28T21:30:00")
        item_b = _insert_purchased_item(conn, list_id, "2026-07-28T22:30:00")

    command.upgrade(alembic_config, "head")

    with engine.begin() as conn:
        purchases = conn.execute(
            sa.text("SELECT id FROM purchases WHERE list_id = :list_id"), {"list_id": list_id}
        ).fetchall()
        assert len(purchases) == 2

        rows = conn.execute(
            sa.text("SELECT id, purchase_id FROM list_items WHERE id IN (:a, :b)"),
            {"a": item_a, "b": item_b},
        ).fetchall()
    purchase_ids_by_item = {row.id: row.purchase_id for row in rows}
    assert purchase_ids_by_item[item_a] is not None
    assert purchase_ids_by_item[item_b] is not None
    assert purchase_ids_by_item[item_a] != purchase_ids_by_item[item_b]


def test_one_days_shopping_lands_in_one_trip(alembic_config: Config, db_url: str) -> None:
    command.upgrade(alembic_config, PRE_PURCHASES_REVISION)
    list_id = str(uuid.uuid4())
    engine = _engine(db_url)
    with engine.begin() as conn:
        _insert_household(conn, list_id)
        earliest = _insert_purchased_item(conn, list_id, "2026-07-28T10:00:00", "Mercadona")
        _insert_purchased_item(conn, list_id, "2026-07-28T15:00:00", "Mercadona")

    command.upgrade(alembic_config, "head")

    with engine.begin() as conn:
        purchases = (
            conn.execute(
                sa.text("SELECT * FROM purchases WHERE list_id = :list_id"), {"list_id": list_id}
            )
            .mappings()
            .all()
        )
    assert len(purchases) == 1
    trip = purchases[0]
    assert datetime.fromisoformat(str(trip["opened_at"])) == datetime(2026, 7, 28, 10, 0, 0)
    assert trip["closed_at"] is None
    assert trip["total"] is None

    with engine.begin() as conn:
        earliest_row = (
            conn.execute(
                sa.text("SELECT purchase_id FROM list_items WHERE id = :id"), {"id": earliest}
            )
            .mappings()
            .one()
        )
    assert earliest_row["purchase_id"] == trip["id"]


def test_two_distinct_stores_backfill_to_null_store(alembic_config: Config, db_url: str) -> None:
    """Two distinct price_store values in one group must not become a guess."""
    command.upgrade(alembic_config, PRE_PURCHASES_REVISION)
    list_id = str(uuid.uuid4())
    engine = _engine(db_url)
    with engine.begin() as conn:
        _insert_household(conn, list_id)
        _insert_purchased_item(conn, list_id, "2026-07-28T10:00:00", "Mercadona")
        _insert_purchased_item(conn, list_id, "2026-07-28T15:00:00", "Carrefour")

    command.upgrade(alembic_config, "head")

    with engine.begin() as conn:
        purchases = conn.execute(
            sa.text("SELECT store FROM purchases WHERE list_id = :list_id"), {"list_id": list_id}
        ).fetchall()
    assert len(purchases) == 1
    assert purchases[0].store is None


def test_unpurchased_items_get_no_purchase_id(alembic_config: Config, db_url: str) -> None:
    command.upgrade(alembic_config, PRE_PURCHASES_REVISION)
    list_id = str(uuid.uuid4())
    engine = _engine(db_url)
    with engine.begin() as conn:
        _insert_household(conn, list_id)
        item_id = _insert_unpurchased_item(conn, list_id)

    command.upgrade(alembic_config, "head")

    with engine.begin() as conn:
        row = (
            conn.execute(
                sa.text("SELECT purchase_id FROM list_items WHERE id = :id"), {"id": item_id}
            )
            .mappings()
            .one()
        )
    assert row["purchase_id"] is None
