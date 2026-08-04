from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


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
    date: date
    # Deliberately unconstrained — no ge=0, no allow_inf_nan=False. Range and
    # finiteness are checked in the handler instead, for the reason spelled out
    # on PurchaseCloseBody.total: a Pydantic constraint able to reject a NaN
    # total crashes FastAPI's own 422 handler when it echoes the value back.
    total: float | None = None


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


class PurchasePage(BaseModel):
    purchases: list[PurchaseSummary]
    # Every trip the list has, not the page's share of them — the client
    # needs it to know whether to ask for another page.
    total: int
