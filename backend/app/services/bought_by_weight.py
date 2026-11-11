from collections.abc import Sequence

from sqlmodel import Session, col, select

from app.db.models import ListItem


def mark_bought_by_weight(session: Session, list_id: str, items: Sequence[ListItem]) -> None:
    """Stamp each item with whether this list ever priced the product per kg.

    Clients offer the weighed-label scan on such products. The product is
    matched the way price history matches it: by EAN when the item has one,
    else by the exact name and brand. The flag rides on the ORM object as a
    transient attribute, like the trip facts, and ItemRead picks it up.
    """
    rows = session.exec(
        select(ListItem.name, ListItem.brand, ListItem.ean).where(
            ListItem.list_id == list_id, col(ListItem.price_per) == "KILOGRAM"
        )
    ).all()
    eans = {ean for _, _, ean in rows if ean}
    names = {(name, brand) for name, brand, _ in rows}
    for item in items:
        by_weight = item.ean in eans if item.ean else (item.name, item.brand) in names
        # object.__setattr__ because pydantic rejects undeclared fields.
        object.__setattr__(item, "bought_by_weight", by_weight)
