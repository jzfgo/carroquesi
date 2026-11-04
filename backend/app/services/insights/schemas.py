"""The insight records: the contract every surface renders.

Amounts are euros rounded to cents; deltas are fractions (0.65 is +65 %)
and None when there is nothing to compare with.
"""

from typing import Literal

from pydantic import BaseModel


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


class Totals(_Record):
    type: Literal["totals"] = "totals"
    total: float
    # True when any trip had no confirmed total and its lines stood in.
    approximate: bool
    trips: int
    trips_confirmed: int
    vs_previous: float | None
    vs_average: float | None
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
