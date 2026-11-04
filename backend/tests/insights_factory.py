"""Build in-memory insight windows for tests, without a database."""

from datetime import UTC, datetime
from itertools import count
from typing import Literal
from zoneinfo import ZoneInfo

from app.services.fold import fold_name
from app.services.insights.data import Line, Trip, Window, local_month
from app.services.store_key import store_key

MADRID = ZoneInfo("Europe/Madrid")
_ids = count()


def at(day: str, hour: int = 10) -> datetime:
    """A UTC instant at `hour` local time on a "YYYY-MM-DD" day."""
    local = datetime.fromisoformat(day).replace(hour=hour, tzinfo=MADRID)
    return local.astimezone(UTC)


def trip(day: str, store: str | None = "Mercadona", total: float | None = None) -> Trip:
    opened = at(day)
    return Trip(
        id=f"t{next(_ids)}",
        opened_at=opened,
        month=local_month(opened, MADRID),
        store_key=store_key(store) if store else None,
        store_raw=store,
        total=total,
    )


def line(
    t: Trip,
    name: str = "Leche",
    amount: float | None = 1.0,
    *,
    brand: str | None = None,
    unit_price: float | None = None,
    basis: Literal["kg", "unit"] | None = "unit",
    store: str | None = None,
    added_by: str = "u-alice",
) -> Line:
    raw = store if store is not None else t.store_raw
    priced = amount is not None
    return Line(
        id=f"l{next(_ids)}",
        trip_id=t.id,
        day=t.opened_at,
        month=t.month,
        product=(fold_name(name), fold_name(brand or "")),
        name=name,
        brand=brand,
        store_key=store_key(raw) if raw else None,
        store_raw=raw,
        added_by=added_by,
        amount=amount,
        unit_price=(unit_price if unit_price is not None else amount) if priced else None,
        basis=basis if priced else None,
    )


def window(trips: list[Trip], lines: list[Line], **fields) -> Window:
    months = sorted(t.month for t in trips)
    return Window(
        list_id="list-1",
        tz=MADRID,
        trips=trips,
        lines=lines,
        first_trip_month=fields.pop("first_trip_month", months[0] if months else None),
        store_names=fields.pop("store_names", {}),
        user_names=fields.pop("user_names", {"u-alice": "Alice", "u-bob": "Bob"}),
    )
