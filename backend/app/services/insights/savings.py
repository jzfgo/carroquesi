"""Cheaper at another chain: products this month bought where this list has
recently paid less for the same product elsewhere.

Only this list's own prices count. When in doubt, say nothing: a wrong
suggestion costs more trust than a missing one.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import mean
from typing import Literal

from app.services.insights.data import Line, Window
from app.services.insights.schemas import (
    DEFAULT_THRESHOLDS,
    CheaperElsewhere,
    SavingsThresholds,
    Suggestion,
)

__all__ = ["SavingsThresholds", "cheaper_elsewhere"]

_DAYS_PER_MONTH = 30


@dataclass(frozen=True)
class _Seen:
    """A priced line at a known store: the only kind a comparison can use."""

    line: Line
    price: float
    basis: Literal["kg", "unit"]
    store_key: str

    @property
    def quantity(self) -> float:
        # In the basis unit: kilos for €/kg, units for €/unit.
        return (self.line.amount or 0.0) / self.price


def cheaper_elsewhere(
    w: Window, month: str, month_end: datetime, th: SavingsThresholds = DEFAULT_THRESHOLDS
) -> CheaperElsewhere:
    start = month_end - timedelta(days=th.window_days)
    # Prices are compared only on the same scale: €/kg with €/kg, €/unit with €/unit.
    by_product: dict[tuple, list[_Seen]] = defaultdict(list)
    for line in w.lines:
        if line.unit_price and line.basis and line.store_key and start <= line.day < month_end:
            seen = _Seen(line, line.unit_price, line.basis, line.store_key)
            by_product[(line.product, line.basis)].append(seen)

    suggestions: list[Suggestion] = []
    for observations in by_product.values():
        monthly_quantity = sum(o.quantity for o in observations) * _DAYS_PER_MONTH / th.window_days
        paid_here: dict[str, list[_Seen]] = defaultdict(list)
        for o in observations:
            if o.line.month == month:
                paid_here[o.store_key].append(o)
        for paid in paid_here.values():
            suggestion = _best_elsewhere(w, th, observations, paid, monthly_quantity)
            if suggestion:
                suggestions.append(suggestion)

    suggestions.sort(key=lambda s: -s.monthly_eur)
    return CheaperElsewhere(
        list_id=w.list_id,
        period=month,
        suggestions=suggestions[: th.max_suggestions],
        thresholds=th,
    )


def _spreads(seen: list[_Seen], th: SavingsThresholds) -> bool:
    """A per-unit price that moves a lot at one store may be a different
    size (a tray, a pack), not a different price. Weighed prices already
    account for size, so they may move freely."""
    if seen[0].basis != "unit":
        return False
    prices = [o.price for o in seen]
    return (max(prices) - min(prices)) / min(prices) > th.max_spread_pct


def _best_elsewhere(
    w: Window,
    th: SavingsThresholds,
    observations: list[_Seen],
    paid: list[_Seen],
    monthly_quantity: float,
) -> Suggestion | None:
    here = paid[0].store_key
    paid_price = mean(o.price for o in paid)
    by_store: dict[str, list[_Seen]] = defaultdict(list)
    for o in observations:
        by_store[o.store_key].append(o)
    # Checked at the paid store too: the other store often has a single
    # price, which cannot spread, while the usual store has several.
    if _spreads(by_store.pop(here), th):
        return None

    best: _Seen | None = None
    for seen in by_store.values():
        if len(seen) < th.min_observations or _spreads(seen, th):
            continue
        latest = max(seen, key=lambda o: o.line.day)
        if (paid_price - latest.price) / paid_price < th.min_saving_pct:
            continue
        if best is None or latest.price < best.price:
            best = latest

    if best is None:
        return None
    monthly = (paid_price - best.price) * monthly_quantity
    if monthly < th.min_monthly_eur:
        return None

    sample = max(paid, key=lambda o: o.line.day).line
    return Suggestion(
        name=sample.name,
        brand=sample.brand,
        basis=best.basis,
        paid_store_key=here,
        paid_store=w.store_name(here, sample.store_raw),
        paid_price=round(paid_price, 2),
        cheaper_store_key=best.store_key,
        cheaper_store=w.store_name(best.store_key, best.line.store_raw),
        cheaper_price=round(best.price, 2),
        cheaper_seen_at=best.line.day.astimezone(w.tz).date(),
        saving_pct=round((paid_price - best.price) / paid_price, 4),
        monthly_eur=round(monthly, 2),
    )
