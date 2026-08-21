# `date` is aliased because two schemas below carry a field literally named
# `date`; a field named the same as its own type shadows the type when a
# defaulted annotation (`date | None = None`) is evaluated at class-definition.
from datetime import date as date_cls
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.items import ItemRead


class PurchaseLine(BaseModel):
    """One claimed line of the close sheet.

    Unlike a receipt's PricePatch, `price` is optional: a line without an
    amount is a legitimate outcome — bought, nobody kept the figure — and no
    amount is invented for it. No store either: a ticket belongs to one shop,
    stated once on the close.
    """

    item_id: str
    price: float | None = None
    price_per: Literal["KILOGRAM"] | None = None
    # The quantity actually bought. Writes purchased_quantity; the planned
    # quantity the household typed is left alone.
    quantity: str | None = None
    # A correction to the product made in the adjust-product editor (10d) at
    # close time. None leaves the stored value untouched; a value overwrites it.
    name: str | None = Field(default=None, min_length=1, max_length=200)
    brand: str | None = None


class PurchaseNewItem(BaseModel):
    """Something bought that was never on the list. Born already purchased."""

    # Stricter than ItemCreate.name, whose length is unbounded: this one
    # arrives in a list of up to 200 of them.
    name: str = Field(min_length=1, max_length=200)
    brand: str | None = None
    ean: str | None = None
    price: float | None = None
    price_per: Literal["KILOGRAM"] | None = None
    quantity: str | None = None


class PurchaseCloseBody(BaseModel):
    # Absent means the open cart. Naming exists for the other case: a trip
    # that tore off with nobody saying what it was, written down later.
    purchase_id: str | None = None
    # Required, and stricter than the receipt-review screen, which allows an
    # empty store. Whoever closes a purchase was there and knows the shop;
    # the only trip without one is a trip nobody ever closed.
    store: str = Field(min_length=1, max_length=100)
    # The figure printed on the paper, never the sum of the lines. A close
    # with no paper leaves it NULL.
    #
    # Deliberately unconstrained — no ge=0, no allow_inf_nan=False. Range and
    # finiteness are checked in the handler instead: a NaN input fails ge=0
    # too (IEEE 754 comparisons with NaN are always false), so any Pydantic
    # constraint able to reject a NaN total crashes FastAPI's own
    # validation-error handler when it echoes the rejected value back in the
    # 422 body — Starlette serializes that body with allow_nan=False. `store`
    # above is safe to constrain because a bounded string has no such value.
    total: float | None = None
    # At least one claimed line: a close that names nothing closed nothing.
    # The upper bound exists only because this and new_items are the two
    # fields that can carry an unbounded payload.
    lines: list[PurchaseLine] = Field(min_length=1, max_length=200)
    new_items: list[PurchaseNewItem] = Field(default_factory=list, max_length=200)
    # The day the shop happened. Absent files the trip under the close instant
    # (today); given, the trip is filed under that day — its boundaries derive
    # from the date in the request's client timezone, the same mapping a manual
    # purchase uses (ADR-012), so a back-dated close sorts under its covered day.
    date: date_cls | None = None


class PurchaseManualBody(BaseModel):
    """A shop entered by hand — a trip born closed, holding no lines.

    Unlike a close, this names no items: it records that a shop happened on a
    given calendar day, optionally where and for how much, without touching the
    cart. `date` is the day the household lived through; the handler maps it to
    the trip's boundaries in the request's client timezone (ADR-012).
    """

    # Optional, unlike the close: someone writing a shop down days later may no
    # longer recall the shop, and a bare date is still a legitimate record.
    store: str | None = Field(default=None, max_length=100)
    # The calendar day the shop happened on. Required — there is no cart to
    # derive dates from, so the day is the whole point of the request.
    date: date_cls
    # Deliberately unconstrained — no ge=0, no allow_inf_nan=False. Range and
    # finiteness are checked in the handler instead, for the reason spelled out
    # on PurchaseCloseBody.total: a Pydantic constraint able to reject a NaN
    # total crashes FastAPI's own 422 handler when it echoes the value back.
    total: float | None = None
    # The lineless scan whose paper this record should carry (the 18c rescue:
    # an unreadable ticket still saves its capture). The handler links the
    # scan to the purchase it creates, so the record shows its paper.
    scan_id: str | None = None


class PurchaseRead(BaseModel):
    id: str
    list_id: str
    opened_at: datetime
    tears_off_at: datetime
    closed_at: datetime | None
    store: str | None
    total: float | None


class PurchaseSummary(PurchaseRead):
    """One row of the purchase history page.

    Carries what the page renders per ticket without fetching its lines:
    how many lines it holds, and whether a receipt scan reconciled it.
    """

    line_count: int
    # Derived from receipt_scans.purchase_id, which only an applied scan
    # sets. Scans that predate the link stay NULL, so old tickets read
    # False even when a receipt was scanned for them.
    has_receipt: bool
    # A provisional total summed from the lines' `price * quantity_factor`, for
    # a proto-ticket whose own `total` was never confirmed (a close sets that).
    # None when no line carries a price. The stack shows it as «≈ total»; a
    # closed trip ignores it and shows its confirmed `total`.
    items_total: float | None = None
    # The trip's lines, carried only when the caller asked for them
    # (include_items): the stack's first page renders its trips expanded, and
    # one batched read beats one request per card. None means «not asked»,
    # never «no lines» — that is the empty list.
    items: list[ItemRead] | None = None


class PurchasePage(BaseModel):
    purchases: list[PurchaseSummary]
    # Every trip the list has, not the page's share of them — the client
    # needs it to know whether to ask for another page.
    total: int


class PurchaseSearchTrip(BaseModel):
    """One trip in a stack search (21b).

    Carries the trip's summary and only the lines whose name, brand or store
    matched the query. How many lines the trip holds in all rides in the
    summary's line_count, so the client can print «N de M» — N being the
    number of matched lines here, M the trip's whole line count.
    """

    trip: PurchaseSummary
    lines: list[ItemRead]


class PurchaseSearchResults(BaseModel):
    """Every settled trip that matched a stack search, newest shop first."""

    results: list[PurchaseSearchTrip]
