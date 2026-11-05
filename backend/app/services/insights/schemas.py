"""The insight records: the contract every surface renders.

Amounts are euros rounded to cents; deltas are fractions (0.65 is +65 %)
and None when there is nothing to compare with.
"""

from dataclasses import dataclass
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field


class _Record(BaseModel):
    list_id: str
    period: str


class _LineCoverage(BaseModel):
    """How many of the period's lines the figure could count. A line with no
    price, or a per-kg price with no weight, adds no money."""

    lines_total: int
    lines_priced: int


class MonthPoint(BaseModel):
    month: str
    total: float
    approximate: bool


class Baseline(BaseModel):
    """The months a month is compared with: up to the twelve before it,
    complete ones only. A month is complete when it has trips and every
    trip has a confirmed total; a line sum would read too low."""

    months: list[str]
    mean: float


class Totals(_Record):
    type: Literal["totals"] = "totals"
    total: float
    # True when any trip had no confirmed total and its lines stood in.
    approximate: bool
    trips: int
    trips_confirmed: int
    vs_previous: float | None
    baseline: Baseline | None
    vs_average: float | None
    # Against the same month a year before, when that month is complete.
    vs_last_year: float | None
    series: list[MonthPoint]


class StoreSpend(BaseModel):
    store_key: str | None
    name: str
    amount: float
    trips: int


class ByStore(_Record):
    type: Literal["by_store"] = "by_store"
    stores: list[StoreSpend]


class ProductSpend(BaseModel):
    name: str
    brand: str | None
    amount: float
    vs_average: float | None
    new: bool


class TopProducts(_Record, _LineCoverage):
    type: Literal["top_products"] = "top_products"
    products: list[ProductSpend]


class RequesterSpend(BaseModel):
    user_id: str
    name: str
    amount: float


class ByRequester(_Record, _LineCoverage):
    type: Literal["by_requester"] = "by_requester"
    requesters: list[RequesterSpend]


class Cadence(_Record):
    type: Literal["cadence"] = "cadence"
    trips: int
    mean_days_between: float | None


@dataclass(frozen=True)
class SavingsThresholds:
    """When a cheaper price elsewhere is worth saying. Defaults agreed on
    real data: they leave 0–3 suggestions a month."""

    min_saving_pct: float = 0.10
    min_monthly_eur: float = 1.0
    min_observations: int = 1
    window_days: int = 90
    # Per-unit prices that move more than this at either store may hide
    # a size difference (trays, packs), so they are not trusted.
    max_spread_pct: float = 0.15
    max_suggestions: int = 5


DEFAULT_THRESHOLDS = SavingsThresholds()


class Suggestion(BaseModel):
    name: str
    brand: str | None
    basis: Literal["kg", "unit"]
    paid_store_key: str
    paid_store: str
    paid_price: float
    cheaper_store_key: str
    cheaper_store: str
    cheaper_price: float
    cheaper_seen_at: date
    saving_pct: float
    monthly_eur: float


class CheaperElsewhere(_Record):
    type: Literal["cheaper_elsewhere"] = "cheaper_elsewhere"
    suggestions: list[Suggestion]
    thresholds: SavingsThresholds


Insight = Annotated[
    Totals | ByStore | TopProducts | ByRequester | Cadence | CheaperElsewhere,
    Field(discriminator="type"),
]


class Coverage(_LineCoverage):
    """How much of the month the figures can see. Rankings by product only
    count priced lines, so every surface that shows one shows this too."""

    trips: int
    trips_confirmed: int
    # Confirmed totals minus the money their trips' lines add up to. Unpriced
    # lines leave it above zero; discounts a receipt does not itemise can take
    # it below. A trip with no confirmed total cannot tell, so it is left out,
    # and with no confirmed trip at all this is None: zero would claim a match.
    unattributed: float | None
    # Purchased lines with no trip: left out of every figure, counted here.
    tripless_lines: int


class SpendReport(BaseModel):
    list_id: str
    period: str
    tz: str
    insights: list[Insight]
    coverage: Coverage
