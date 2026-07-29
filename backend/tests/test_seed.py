"""Pure-data tests for scripts/seed.py's Purchase backfill.

No DB session here on purpose: group_into_purchases is a pure function over
ListItem objects, and importing scripts.seed already builds the whole
SEED_ITEMS/SEED_PURCHASES module-level data as a side effect of import. These
tests exercise that data directly rather than re-running it against a
database, the way test_migrations.py exercises the Alembic backfill it
mirrors.
"""

from datetime import datetime

from app.db.models import ListItem, Purchase
from app.services import trips
from scripts.seed import SEED_ITEMS, SEED_PURCHASES, group_into_purchases


def test_every_purchased_seed_item_gets_a_purchase_id():
    purchased = [item for item in SEED_ITEMS if item.purchased_at is not None]
    assert purchased, "fixture drifted: no purchased seed items to test against"
    for item in purchased:
        assert item.purchase_id is not None, f"{item.id} has purchased_at but no purchase_id"


def test_unpurchased_seed_items_get_no_purchase_id():
    unpurchased = [item for item in SEED_ITEMS if item.purchased_at is None]
    assert unpurchased, "fixture drifted: no unpurchased seed items to test against"
    for item in unpurchased:
        assert item.purchase_id is None


def test_seed_purchase_ids_all_start_with_seed_prefix():
    # _delete_seed_rows matches on id.startswith("seed-"); a generated id
    # that misses this prefix would leak across every re-seed and, once
    # Purchase has a real FK enforced (Postgres), break the next run's
    # delete_list-style cleanup the same way an un-prefixed row would.
    assert SEED_PURCHASES
    for purchase in SEED_PURCHASES:
        assert purchase.id.startswith("seed-")


def test_seed_purchases_group_by_list_and_local_day():
    """One Purchase per (list_id, Madrid local day of purchased_at) --
    mirrors the migration's backfill grouping, computed via the live
    tears_off_at_for rather than a frozen copy of it.
    """
    by_id = {p.id: p for p in SEED_PURCHASES}
    expected_groups: dict[tuple[str, datetime], set[str]] = {}
    for item in SEED_ITEMS:
        if item.purchased_at is None:
            continue
        key = (item.list_id, trips.tears_off_at_for(item.purchased_at))
        expected_groups.setdefault(key, set()).add(item.id)

    actual_groups: dict[tuple[str, datetime], set[str]] = {}
    for item in SEED_ITEMS:
        if item.purchase_id is None:
            continue
        purchase = by_id[item.purchase_id]
        key = (purchase.list_id, purchase.tears_off_at)
        actual_groups.setdefault(key, set()).add(item.id)

    assert actual_groups == expected_groups


def test_seed_purchases_are_never_closed():
    # Nobody closed these by hand -- marking them closed would fabricate a
    # fact that never happened, same as the migration's backfill.
    for purchase in SEED_PURCHASES:
        assert purchase.closed_at is None
        assert purchase.total is None


def test_group_into_purchases_is_a_pure_function_of_its_items():
    """Re-running the grouping on a small, hand-built list is independent of
    the module-level SEED_ITEMS/SEED_PURCHASES side effect, and pins the
    opened_at/store rules directly.
    """
    a = ListItem(
        id="a",
        list_id="list-1",
        name="Leche",
        added_by="user-1",
        purchased_at=datetime(2026, 7, 28, 16, 0),
        price_store="Mercadona",
    )
    b = ListItem(
        id="b",
        list_id="list-1",
        name="Pan",
        added_by="user-1",
        purchased_at=datetime(2026, 7, 28, 18, 0),
        price_store="Mercadona",
    )
    # Different local day -> different trip.
    c = ListItem(
        id="c",
        list_id="list-1",
        name="Huevos",
        added_by="user-1",
        purchased_at=datetime(2026, 7, 26, 10, 0),
        price_store=None,
    )
    # Not purchased -> excluded entirely.
    d = ListItem(id="d", list_id="list-1", name="Sal", added_by="user-1")

    purchases = group_into_purchases([a, b, c, d])

    assert len(purchases) == 2
    assert a.purchase_id == b.purchase_id
    assert a.purchase_id != c.purchase_id
    assert d.purchase_id is None

    same_day = next(p for p in purchases if p.id == a.purchase_id)
    assert same_day.opened_at == datetime(2026, 7, 28, 16, 0)
    assert same_day.store == "Mercadona"

    other_day = next(p for p in purchases if p.id == c.purchase_id)
    assert other_day.store is None


def test_group_into_purchases_leaves_store_null_on_disagreement():
    a = ListItem(
        id="a",
        list_id="list-1",
        name="Leche",
        added_by="user-1",
        purchased_at=datetime(2026, 7, 28, 16, 0),
        price_store="Mercadona",
    )
    b = ListItem(
        id="b",
        list_id="list-1",
        name="Pan",
        added_by="user-1",
        purchased_at=datetime(2026, 7, 28, 18, 0),
        price_store="Dia",
    )

    purchases = group_into_purchases([a, b])

    assert len(purchases) == 1
    assert purchases[0].store is None


def test_group_into_purchases_returns_purchase_instances():
    a = ListItem(
        id="a",
        list_id="list-1",
        name="Leche",
        added_by="user-1",
        purchased_at=datetime(2026, 7, 28, 16, 0),
    )
    purchases = group_into_purchases([a])
    assert len(purchases) == 1
    assert isinstance(purchases[0], Purchase)
