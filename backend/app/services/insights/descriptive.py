"""What happened in the month: totals, stores, products, requesters, cadence."""

from collections import defaultdict
from datetime import date
from statistics import mean

from app.services.insights.data import Line, Trip, Window, shift_month
from app.services.insights.schemas import (
    Baseline,
    ByRequester,
    ByStore,
    Cadence,
    Coverage,
    MonthPoint,
    ProductMove,
    ProductMoves,
    ProductSpend,
    RequesterSpend,
    StoreSpend,
    TopProducts,
    Totals,
)

SERIES_MONTHS = 5
BASELINE_MONTHS = 12
TOP_PRODUCTS = 10
MOVES = 5

Product = tuple[str, str]


def totals(w: Window, month: str) -> Totals:
    trips = _trips_in(w, month)
    current, approximate = _month_money(w, month)
    previous = shift_month(month, -1)
    prev_total = _month_money(w, previous)[0] if _has_history(w, previous) else None
    months = _baseline_months(w, month)
    average = mean(_month_money(w, m)[0] for m in months) if months else None
    year_ago = shift_month(month, -12)
    last_year = _month_money(w, year_ago)[0] if _complete(w, year_ago) else None
    series = [shift_month(month, -k) for k in range(SERIES_MONTHS - 1, -1, -1)]
    return Totals(
        list_id=w.list_id,
        period=month,
        total=round(current, 2),
        approximate=approximate,
        trips=len(trips),
        trips_confirmed=sum(1 for t in trips if t.total is not None),
        vs_previous=_delta(current, prev_total),
        trips_previous=len(_trips_in(w, previous)) if prev_total is not None else None,
        baseline=Baseline(months=months, mean=round(average, 2)) if average is not None else None,
        vs_average=_delta(current, average),
        vs_last_year=_delta(current, last_year),
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
    months = _baseline_months(w, month)
    averages = _product_averages(w, months)
    # "New" looks at every earlier month in reach, complete or not: a
    # product bought in a month with an unconfirmed trip is not new.
    lookback = {shift_month(month, -k) for k in range(1, BASELINE_MONTHS + 1)}
    seen_before = {line.product for line in w.lines if line.month in lookback}
    has_past = _has_history(w, shift_month(month, -1))

    by_product: dict[Product, list[Line]] = defaultdict(list)
    for line in lines:
        by_product[line.product].append(line)

    def spend(p: Product) -> ProductSpend:
        group = by_product[p]
        latest = max(group, key=lambda x: x.day)
        amount = sum(x.amount or 0.0 for x in group)
        average = averages.get(p, 0.0) if months else None
        measures = {x.measure for x in group}
        known = all(x.quantity is not None for x in group) and len(measures) == 1
        return ProductSpend(
            name=latest.name,
            brand=latest.brand,
            amount=round(amount, 2),
            average=round(average, 2) if average is not None else None,
            vs_average=_delta(amount, average),
            # With no earlier month to look at, nothing can be called new.
            new=has_past and p not in seen_before,
            quantity=round(sum(x.quantity or 0.0 for x in group), 3) if known else None,
            measure=measures.pop() if len(measures) == 1 else "ud",
            trips=len({x.trip_id for x in group}),
        )

    priced = [p for p, group in by_product.items() if any(x.amount is not None for x in group)]
    products = sorted((spend(p) for p in priced), key=lambda s: -s.amount)
    frequent = sorted((spend(p) for p in by_product), key=lambda s: (-s.trips, -s.amount))
    return TopProducts(
        list_id=w.list_id,
        period=month,
        products=products[:TOP_PRODUCTS],
        most_frequent=frequent[0] if frequent else None,
        lines_total=len(lines),
        lines_priced=_priced(lines),
    )


def product_moves(w: Window, month: str) -> ProductMoves:
    """Each product's money this month against its mean over the same
    months the total is compared with, so the movers explain that figure."""
    months = _baseline_months(w, month)
    if not months:
        return ProductMoves(list_id=w.list_id, period=month, rises=[], falls=[])
    averages = _product_averages(w, months)
    current: dict[Product, float] = defaultdict(float)
    for line in _lines_in(w, month):
        if line.amount is not None:
            current[line.product] += line.amount
    # The name as last written, from this month or else the baseline.
    names: dict[Product, Line] = {}
    for line in sorted(w.lines, key=lambda x: x.day):
        if line.month == month or line.month in months:
            names[line.product] = line
    moves = []
    for p in current.keys() | averages.keys():
        amount, average = current.get(p, 0.0), averages.get(p, 0.0)
        delta = round(amount - average, 2)
        if delta:
            moves.append(
                ProductMove(
                    name=names[p].name,
                    brand=names[p].brand,
                    amount=round(amount, 2),
                    average=round(average, 2),
                    delta=delta,
                )
            )
    rises = sorted((m for m in moves if m.delta > 0), key=lambda m: -m.delta)
    falls = sorted((m for m in moves if m.delta < 0), key=lambda m: m.delta)
    return ProductMoves(list_id=w.list_id, period=month, rises=rises[:MOVES], falls=falls[:MOVES])


def _product_averages(w: Window, months: list[str]) -> dict[Product, float]:
    """Each product's money per baseline month, absent months counting as 0."""
    if not months:
        return {}
    picked = set(months)
    money: dict[Product, float] = defaultdict(float)
    for line in w.lines:
        if line.month in picked and line.amount is not None:
            money[line.product] += line.amount
    return {p: amount / len(months) for p, amount in money.items()}


def by_requester(w: Window, month: str) -> ByRequester:
    lines = _lines_in(w, month)
    money: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    for line in lines:
        counts[line.added_by] += 1
        if line.amount is not None:
            money[line.added_by] += line.amount
    requesters: list[RequesterSpend] = [
        RequesterSpend(
            user_id=uid,
            name=w.user_names.get(uid, uid),
            amount=round(money[uid], 2),
            lines=n,
        )
        for uid, n in counts.items()
    ]
    requesters.sort(key=lambda r: (-r.amount, -r.lines))
    return ByRequester(
        list_id=w.list_id,
        period=month,
        requesters=requesters,
        lines_total=len(lines),
        lines_priced=_priced(lines),
    )


def coverage(w: Window, month: str, tripless_lines: int) -> Coverage:
    trips = _trips_in(w, month)
    lines = _lines_in(w, month)
    confirmed = [t for t in trips if t.total is not None]
    # Rounded per trip, so float noise on a trip that matches is not a gap.
    gaps = [round(_trip_money(w, t)[0] - _lines_money(w, t), 2) for t in confirmed]
    under = round(sum(g for g in gaps if g > 0), 2) if confirmed else None
    over = round(-sum(g for g in gaps if g < 0), 2) if confirmed else None
    return Coverage(
        lines_total=len(lines),
        lines_priced=_priced(lines),
        trips=len(trips),
        trips_confirmed=len(confirmed),
        unattributed=under,
        lines_over=over,
        trips_lines_over=sum(1 for g in gaps if g < 0),
        tripless_lines=tripless_lines,
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


def _lines_money(w: Window, t: Trip) -> float:
    return sum(line.amount or 0.0 for line in w.lines if line.trip_id == t.id)


def _trip_money(w: Window, t: Trip) -> tuple[float, bool]:
    """A trip's confirmed total, or its line sum flagged approximate."""
    if t.total is not None:
        return t.total, False
    return _lines_money(w, t), True


def _month_money(w: Window, month: str) -> tuple[float, bool]:
    parts = [_trip_money(w, t) for t in _trips_in(w, month)]
    return sum(money for money, _ in parts), any(approx for _, approx in parts)


def _has_history(w: Window, month: str) -> bool:
    return w.first_trip_month is not None and month >= w.first_trip_month


def _complete(w: Window, month: str) -> bool:
    """A month a comparison can trust: it has trips, all with a confirmed
    total. Empty months are left out too: a summer away is not a normal month."""
    trips = _trips_in(w, month)
    return bool(trips) and all(t.total is not None for t in trips)


def _baseline_months(w: Window, month: str) -> list[str]:
    """The complete months among the twelve before `month`, oldest first."""
    candidates = [shift_month(month, -k) for k in range(BASELINE_MONTHS, 0, -1)]
    return [m for m in candidates if _complete(w, m)]


def _delta(current: float, base: float | None) -> float | None:
    if not base:
        return None
    return round((current - base) / base, 4)


def _priced(lines: list[Line]) -> int:
    return sum(1 for line in lines if line.amount is not None)


def _local_day(w: Window, t: Trip) -> date:
    return t.opened_at.astimezone(w.tz).date()
