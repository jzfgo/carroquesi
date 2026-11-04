"""Load one list's trips and purchased lines for a window, as plain data.

The insights run in Python over these records because a line's money needs
its free-text quantity parsed, which SQL cannot do. Loading once and
computing in memory also keeps every rule in one language.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, tzinfo
from typing import Literal

from sqlmodel import Session, col, func, select

from app.db.models import ListItem, ListStore, Purchase, User
from app.services.fold import fold_name
from app.services.quantity import effective_quantity, line_amount, unit_price
from app.services.store_key import store_key


def month_bounds(month: str, tz: tzinfo) -> tuple[datetime, datetime]:
    """`[start, end)` of a "YYYY-MM" month in `tz`, as naive UTC like the DB."""
    year, mon = _parse_month(month)
    nxt_year, nxt_mon = _parse_month(shift_month(month, 1))
    return _naive_utc(datetime(year, mon, 1, tzinfo=tz)), _naive_utc(
        datetime(nxt_year, nxt_mon, 1, tzinfo=tz)
    )


def shift_month(month: str, delta: int) -> str:
    year, mon = _parse_month(month)
    index = year * 12 + (mon - 1) + delta
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def local_month(instant: datetime, tz: tzinfo) -> str:
    """The "YYYY-MM" a naive-UTC instant falls in, seen from `tz`."""
    return instant.replace(tzinfo=UTC).astimezone(tz).strftime("%Y-%m")


def _parse_month(month: str) -> tuple[int, int]:
    parsed = datetime.strptime(month, "%Y-%m")
    return parsed.year, parsed.month


def _naive_utc(aware: datetime) -> datetime:
    return aware.astimezone(UTC).replace(tzinfo=None)


def _key(raw: str | None) -> str | None:
    return store_key(raw) if raw else None


@dataclass(frozen=True)
class Trip:
    id: str
    opened_at: datetime
    month: str
    store_key: str | None
    store_raw: str | None
    total: float | None


@dataclass(frozen=True)
class Line:
    id: str
    trip_id: str
    purchased_at: datetime
    month: str
    product: tuple[str, str]
    name: str
    brand: str | None
    store_key: str | None
    store_raw: str | None
    added_by: str
    amount: float | None
    unit_price: float | None
    basis: Literal["kg", "unit"] | None


@dataclass
class Window:
    list_id: str
    tz: tzinfo
    trips: list[Trip]
    lines: list[Line]
    first_trip_month: str | None
    store_names: dict[str, str]
    user_names: dict[str, str]
    tripless_lines: int


def load_window(
    session: Session, list_id: str, start: datetime, end: datetime, tz: tzinfo
) -> Window:
    """Trips opened in `[start, end)` and their lines.

    Purchased lines with no trip predate trips; their day and store cannot be
    trusted, so they are only counted, for coverage.
    """
    purchases = session.exec(
        select(Purchase).where(
            Purchase.list_id == list_id,
            col(Purchase.opened_at) >= start,
            col(Purchase.opened_at) < end,
        )
    ).all()
    trips = {
        p.id: Trip(
            id=p.id,
            opened_at=p.opened_at,
            month=local_month(p.opened_at, tz),
            store_key=_key(p.store),
            store_raw=p.store,
            total=p.total,
        )
        for p in purchases
    }

    items = (
        session.exec(select(ListItem).where(col(ListItem.purchase_id).in_(list(trips)))).all()
        if trips
        else []
    )
    lines = [_line(item, trips[item.purchase_id], tz) for item in items if item.purchase_id]

    first = session.exec(
        select(func.min(Purchase.opened_at)).where(Purchase.list_id == list_id)
    ).one()
    tripless = session.exec(
        select(func.count())
        .select_from(ListItem)
        .where(
            ListItem.list_id == list_id,
            col(ListItem.purchase_id).is_(None),
            col(ListItem.purchased_at) >= start,
            col(ListItem.purchased_at) < end,
        )
    ).one()
    stores = session.exec(select(ListStore).where(ListStore.list_id == list_id)).all()

    return Window(
        list_id=list_id,
        tz=tz,
        trips=list(trips.values()),
        lines=lines,
        first_trip_month=local_month(first, tz) if first else None,
        store_names={s.store_key: s.display_name for s in stores},
        user_names=_user_names(session, {line.added_by for line in lines}),
        tripless_lines=tripless,
    )


def _line(item: ListItem, trip: Trip, tz: tzinfo) -> Line:
    store_raw = item.price_store or trip.store_raw
    amount = line_amount(item.price, item.quantity, item.purchased_quantity, item.price_per)
    unit, basis = (None, None)
    if item.price is not None and amount is not None:
        quantity = effective_quantity(item.quantity, item.purchased_quantity)
        unit, basis = unit_price(item.price, quantity, item.price_per)
    purchased_at = item.purchased_at or trip.opened_at
    return Line(
        id=item.id,
        trip_id=trip.id,
        purchased_at=purchased_at,
        month=local_month(purchased_at, tz),
        product=(fold_name(item.name), fold_name(item.brand or "")),
        name=item.name,
        brand=item.brand,
        store_key=_key(store_raw),
        store_raw=store_raw,
        added_by=item.added_by,
        amount=amount,
        unit_price=unit,
        basis=basis,
    )


def _user_names(session: Session, ids: Iterable[str]) -> dict[str, str]:
    ids = list(ids)
    if not ids:
        return {}
    users = session.exec(select(User).where(col(User.id).in_(ids))).all()
    return {u.id: u.display_name or u.email for u in users}
