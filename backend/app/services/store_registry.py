"""Per-list store registry: key → canonical display name.

Every write that introduces a store string registers it here; the first
typed form becomes the display name and later spellings leave it alone.
The household fixes a wrong label once, by renaming the entry, and every
surface follows — item rows keep their raw strings untouched.
"""

from collections.abc import Iterable

from sqlmodel import Session, select

from app.db.models import ListItem, ListStore
from app.services.store_key import store_key


def ensure_stores(session: Session, list_id: str, names: Iterable[str]) -> None:
    """Create registry rows for any store names not yet known to the list.

    Existing entries are never touched: the registry's display name is the
    household's choice, and a passing write must not overwrite it.
    """
    wanted: dict[str, str] = {}
    for name in names:
        if name and name.strip():
            wanted.setdefault(store_key(name), name.strip())
    if not wanted:
        return
    existing = set(
        session.exec(select(ListStore.store_key).where(ListStore.list_id == list_id)).all()
    )
    for key, display in wanted.items():
        if key not in existing:
            session.add(ListStore(list_id=list_id, store_key=key, display_name=display))


def backfill_list_stores(session: Session) -> None:
    """One-time backfill from existing item data, for the migration.

    Display name per key = the most frequent raw variant (tie: first seen).
    A one-time heuristic — renames fix whatever it gets wrong. Lives here
    rather than in the migration file because the test suite never runs
    migrations.
    """
    counts: dict[tuple[str, str], dict[str, int]] = {}
    order: dict[tuple[str, str], dict[str, int]] = {}
    # Column selects, not a model select. The migration calls this against the
    # schema as of its own revision, and a model select names every column the
    # *current* model has — so a list_items column added by any later
    # migration would break the upgrade path from scratch.
    items = session.exec(
        select(ListItem.list_id, ListItem.stores, ListItem.price_store).order_by(
            ListItem.created_at
        )
    ).all()
    seq = 0
    for item in items:
        for raw in [*item.stores, *([item.price_store] if item.price_store else [])]:
            raw = raw.strip()
            if not raw:
                continue
            group = (item.list_id, store_key(raw))
            counts.setdefault(group, {})
            order.setdefault(group, {})
            counts[group][raw] = counts[group].get(raw, 0) + 1
            if raw not in order[group]:
                order[group][raw] = seq
                seq += 1

    existing = {
        (row.list_id, row.store_key)
        for row in session.exec(select(ListStore.list_id, ListStore.store_key)).all()
    }
    for (list_id, key), variants in counts.items():
        if (list_id, key) in existing:
            continue
        display = max(variants, key=lambda v: (variants[v], -order[(list_id, key)][v]))
        session.add(ListStore(list_id=list_id, store_key=key, display_name=display))
