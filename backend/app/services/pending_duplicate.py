"""The "already on the list" rule shared by adding an item and re-buying one."""

from sqlmodel import Session, col, select

from app.db.models import ListItem
from app.services.fold import fold_name


def find_pending_duplicate(
    session: Session, list_id: str, name: str, ean: str | None
) -> ListItem | None:
    """Return a pending item on the list with the same folded name or EAN.

    Names compare after folding, so "Pimentón" is a duplicate of "pimenton",
    the same way search and suggestions treat them. Folding happens in Python
    because SQLite has no unaccent; a list's pending items are a few dozen.
    """
    target = fold_name(name)
    pending = session.exec(
        select(ListItem).where(ListItem.list_id == list_id, col(ListItem.purchased_at).is_(None))
    ).all()
    for item in pending:
        if fold_name(item.name) == target or (ean is not None and item.ean == ean):
            return item
    return None
