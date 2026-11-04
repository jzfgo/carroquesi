"""What happened in the month: totals, stores, products, requesters, cadence."""

from collections import defaultdict
from datetime import UTC, date
from statistics import mean

from app.services.insights.data import Line, Trip, Window, shift_month
from app.services.insights.schemas import (
    ByRequester,
    ByStore,
    Cadence,
    MonthPoint,
    ProductSpend,
    RequesterSpend,
    StoreSpend,
    TopProducts,
    Totals,
)

SERIES_MONTHS = 5
AVERAGE_MONTHS = 3
TOP_PRODUCTS = 10


def totals(w: Window, month: str) -> Totals:
    trips = _trips_in(w, month)
    current, approximate = _month_money(w, month)
    previous = shift_month(month, -1)
    prev_total = _month_money(w, previous)[0] if _has_history(w, previous) else None
    history = _history_months(w, month)
    average = mean(_month_money(w, m)[0] for m in history) if history else None
    series = [shift_month(month, -k) for k in range(SERIES_MONTHS - 1, -1, -1)]
    return Totals(
        list_id=w.list_id,
        period=month,
        total=round(current, 2),
        approximate=approximate,
        trips=len(trips),
        trips_confirmed=sum(1 for t in trips if t.total is not None),
        vs_previous=_delta(current, prev_total),
        vs_average=_delta(current, average),
        series=[
            MonthPoint(month=m, total=round(money, 2), approximate=approx)
            for m in series
            for money, approx in [_month_money(w, m)]
        ],
    )


def by_store(w: Window, month: str) -> ByStore:
    # Grouped by the trip's store, not each line's: a trip's money is its
    # confirmed total, which belongs to one shop. Savings compare line prices,
    # so they read each line's own store instead.
    money: dict[str | None, float] = defaultdict(float)
    counts: dict[str | None, int] = defaultdict(int)
    raw: dict[str | None, str] = {}
    for t in _trips_in(w, month):
        money[t.store_key] += _trip_money(w, t)[0]
        counts[t.store_key] += 1
        if t.store_raw:
            raw.setdefault(t.store_key, t.store_raw)
    stores: list[StoreSpend] = [
        StoreSpend(
            store_key=key,
            name=w.store_name(key, raw.get(key)),
            amount=round(money[key], 2),
            trips=counts[key],
        )
        for key in money
    ]
    stores.sort(key=lambda s: -s.amount)
    return ByStore(list_id=w.list_id, period=month, stores=stores)


def top_products(w: Window, month: str) -> TopProducts:
    lines = _lines_in(w, month)
    history = _history_months(w, month)
    past = [line for line in w.lines if line.month in history]
    seen_before = {line.product for line in past}

    money: dict[tuple[str, str], float] = defaultdict(float)
    latest: dict[tuple[str, str], Line] = {}
    for line in lines:
        if line.amount is None:
            continue
        money[line.product] += line.amount
        if line.product not in latest or line.day > latest[line.product].day:
            latest[line.product] = line

    def average(product: tuple[str, str]) -> float | None:
        if not history:
            return None
        return sum(x.amount or 0.0 for x in past if x.product == product) / len(history)

    products = [
        ProductSpend(
            name=latest[p].name,
            brand=latest[p].brand,
            amount=round(amount, 2),
            vs_average=_delta(amount, average(p)),
            # With no earlier month to look at, nothing can be called new.
            new=bool(history) and p not in seen_before,
        )
        for p, amount in money.items()
    ]
    products.sort(key=lambda p: -p.amount)
    return TopProducts(
        list_id=w.list_id,
        period=month,
        products=products[:TOP_PRODUCTS],
        lines_total=len(lines),
        lines_priced=_priced(lines),
    )


def by_requester(w: Window, month: str) -> ByRequester:
    lines = _lines_in(w, month)
    money: dict[str, float] = defaultdict(float)
    for line in lines:
        if line.amount is not None:
            money[line.added_by] += line.amount
    requesters: list[RequesterSpend] = [
        RequesterSpend(user_id=uid, name=w.user_names.get(uid, uid), amount=round(amount, 2))
        for uid, amount in money.items()
    ]
    requesters.sort(key=lambda r: -r.amount)
    return ByRequester(
        list_id=w.list_id,
        period=month,
        requesters=requesters,
        lines_total=len(lines),
        lines_priced=_priced(lines),
    )


def cadence(w: Window, month: str) -> Cadence:
    days = sorted(_local_day(w, t) for t in _trips_in(w, month))
    gaps = [(b - a).days for a, b in zip(days, days[1:], strict=False)]
    return Cadence(
        list_id=w.list_id,
        period=month,
        trips=len(days),
        mean_days_between=mean(gaps) if gaps else None,
    )


# --- helpers ---------------------------------------------------------------


def _trips_in(w: Window, month: str) -> list[Trip]:
    return [t for t in w.trips if t.month == month]


def _lines_in(w: Window, month: str) -> list[Line]:
    trip_ids = {t.id for t in _trips_in(w, month)}
    return [line for line in w.lines if line.trip_id in trip_ids]


def _trip_money(w: Window, t: Trip) -> tuple[float, bool]:
    """A trip's confirmed total, or its line sum flagged approximate."""
    if t.total is not None:
        return t.total, False
    return sum(line.amount or 0.0 for line in w.lines if line.trip_id == t.id), True


def _month_money(w: Window, month: str) -> tuple[float, bool]:
    parts = [_trip_money(w, t) for t in _trips_in(w, month)]
    return sum(money for money, _ in parts), any(approx for _, approx in parts)


def _has_history(w: Window, month: str) -> bool:
    return w.first_trip_month is not None and month >= w.first_trip_month


def _history_months(w: Window, month: str) -> list[str]:
    """The months before `month` an average may use: only those since the
    list's first trip, so a new list is not compared against empty months."""
    candidates = [shift_month(month, -k) for k in range(1, AVERAGE_MONTHS + 1)]
    return [m for m in candidates if _has_history(w, m)]


def _delta(current: float, base: float | None) -> float | None:
    if not base:
        return None
    return round((current - base) / base, 4)


def _priced(lines: list[Line]) -> int:
    return sum(1 for line in lines if line.amount is not None)


def _local_day(w: Window, t: Trip) -> date:
    return t.opened_at.replace(tzinfo=UTC).astimezone(w.tz).date()
