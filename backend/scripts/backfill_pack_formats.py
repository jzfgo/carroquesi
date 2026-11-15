#!/usr/bin/env python3
"""
Fill the pack format of lines saved before names were read for one, and
take it out of their names. Learned name mappings follow the new names.

Usage:
    uv run python scripts/backfill_pack_formats.py            # dry run
    uv run python scripts/backfill_pack_formats.py --apply

One-off: delete this script and its test once it has run in production.

Reads DATABASE_URL like the app. The dry run is read-only at the
database: it prints every change and writes nothing. Run it first, read
the report, then run with --apply.
"""

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, col, select, text

from app.db.models import ChainArticleMapping, ListItem, ReceiptNameMapping, pack_columns
from app.db.session import get_engine
from app.services.fold import fold_name
from app.services.pack_from_name import format_in_name, format_in_quantity, name_without_format
from app.services.pending_duplicate import find_pending_duplicate
from app.services.quantity import effective_quantity, parse_quantity_factor


@dataclass
class ItemChange:
    item: ListItem
    source: str  # "name" or "quantity"
    pack: dict
    name: str
    quantity: str | None
    purchased_quantity: str | None


@dataclass
class MappingChange:
    row: ReceiptNameMapping | ChainArticleMapping
    name: str


@dataclass
class Skipped:
    item: ListItem
    reason: str


@dataclass
class Plan:
    items: list[ItemChange]
    mappings: list[MappingChange]
    skipped: list[Skipped]


def _drop_size(quantity: str | None, pack: dict) -> str | None:
    """A quantity that says the format's size, or one unit of it, is said
    once: «1,5 L» beside 6 × 1,5 L is the size of each bottle."""
    size = format_in_quantity(quantity)
    # «6x1L» counts six in the line's amount: dropping it changes the cost.
    if size is None or parse_quantity_factor(quantity, None) != 1.0:
        return quantity
    one_unit = size["count"] == 1 and (size["content"], size["unit"]) == (
        pack["content"],
        pack["unit"],
    )
    return None if size == pack or one_unit else quantity


def _plan_item(item: ListItem) -> ItemChange | None:
    found = format_in_name(item.name)
    if found is not None:
        name, pack = found
        weighed = item.price_per == "KILOGRAM"
        return ItemChange(
            item=item,
            source="name",
            pack=pack,
            name=name,
            quantity=item.quantity if weighed else _drop_size(item.quantity, pack),
            purchased_quantity=(
                item.purchased_quantity if weighed else _drop_size(item.purchased_quantity, pack)
            ),
        )
    # Only a line bought at a price per unit says its quantity was a package
    # size: a pending «500 g» may still be weighed at the counter.
    if item.purchased_at is None or item.price is None or item.price_per is not None:
        return None
    quantity = effective_quantity(item.quantity, item.purchased_quantity)
    pack = format_in_quantity(quantity)
    # «6x1L» counts as six packs in the line's amount. Moving it would change
    # what the line cost, so only a size that counts as one moves.
    if pack is None or parse_quantity_factor(quantity, None) != 1.0:
        return None
    by_purchased = item.purchased_quantity is not None
    return ItemChange(
        item=item,
        source="quantity",
        pack=pack,
        name=item.name,
        quantity=item.quantity if by_purchased else None,
        purchased_quantity=None if by_purchased else item.purchased_quantity,
    )


def plan(session: Session) -> Plan:
    items: list[ItemChange] = []
    skipped: list[Skipped] = []
    lines = session.exec(
        select(ListItem)
        .where(col(ListItem.pack_count).is_(None), col(ListItem.pack_content).is_(None))
        .order_by(col(ListItem.list_id), col(ListItem.name))
    ).all()
    # Pending names this plan already gives, so two lines that strip to one
    # name are not both renamed into a duplicate.
    planned_pending: set[tuple[str, str]] = set()
    for item in lines:
        change = _plan_item(item)
        if change is None:
            continue
        if item.purchased_at is None and change.name != item.name:
            key = (item.list_id, fold_name(change.name))
            twin = find_pending_duplicate(session, item.list_id, change.name, item.ean)
            if key in planned_pending or (twin is not None and twin.id != item.id):
                skipped.append(Skipped(item, f"otro «{change.name}» ya está pendiente"))
                continue
            planned_pending.add(key)
        items.append(change)

    mappings: list[MappingChange] = []
    for model in (ReceiptNameMapping, ChainArticleMapping):
        for row in session.exec(select(model)).all():
            name = name_without_format(row.item_name)
            if name != row.item_name:
                mappings.append(MappingChange(row, name))
    return Plan(items, mappings, skipped)


def apply(session: Session, planned: Plan) -> None:
    """Writes the plan. Not a write by anyone, so no timestamp moves: the
    un-purchase grace and the list's poll stay as they were. The caller
    commits."""
    for change in planned.items:
        item = change.item
        item.name = change.name
        item.quantity = change.quantity
        item.purchased_quantity = change.purchased_quantity
        for column, value in pack_columns(change.pack).items():
            setattr(item, column, value)
        item.pack_source = change.source
        session.add(item)
    for change in planned.mappings:
        change.row.item_name = change.name
        session.add(change.row)


def _pack(pack: dict) -> str:
    if pack["content"] is None:
        return f"pack de {pack['count']}"
    content = f"{pack['content']:g} {pack['unit']}".replace(".", ",")
    return f"{pack['count']} × {content}" if pack["count"] > 1 else content


def _report(planned: Plan) -> None:
    for change in planned.items:
        item = change.item
        parts = [f"[{change.source}] {item.id}", f"«{item.name}»"]
        if change.name != item.name:
            parts.append(f"→ «{change.name}»")
        parts.append(f"· {_pack(change.pack)}")
        if change.quantity != item.quantity:
            parts.append(f"· cantidad «{item.quantity}» → «{change.quantity or ''}»")
        if change.purchased_quantity != item.purchased_quantity:
            parts.append(
                f"· comprado «{item.purchased_quantity}» → «{change.purchased_quantity or ''}»"
            )
        print(" ".join(parts))
    for change in planned.mappings:
        table = change.row.__tablename__
        print(f"[{table}] {change.row.id} «{change.row.item_name}» → «{change.name}»")
    for skip in planned.skipped:
        print(f"[omitida] {skip.item.id} «{skip.item.name}»: {skip.reason}")
    by_name = sum(1 for c in planned.items if c.source == "name")
    print()
    print(
        f"{len(planned.items)} líneas ({by_name} por nombre, "
        f"{len(planned.items) - by_name} por cantidad), {len(planned.mappings)} emparejamientos, "
        f"{len(planned.skipped)} omitidas."
    )


def _read_only(session: Session) -> None:
    dialect = session.get_bind().dialect.name
    if dialect == "postgresql":
        session.connection().execute(text("SET TRANSACTION READ ONLY"))
    elif dialect == "sqlite":
        session.connection().execute(text("PRAGMA query_only = ON"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the changes")
    args = parser.parse_args()

    with Session(get_engine()) as session:
        if not args.apply:
            _read_only(session)
        planned = plan(session)
        _report(planned)
        if args.apply:
            apply(session, planned)
            session.commit()
            print("Aplicado.")
        else:
            print("Prueba en seco: nada escrito. Repite con --apply para escribir.")


if __name__ == "__main__":
    main()
