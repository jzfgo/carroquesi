from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PurchaseLine(BaseModel):
    """One ticked row of the close sheet.

    Unlike a receipt's PricePatch, `price` is optional: leaving a line without
    an amount is a legitimate outcome, and no amount is invented for it. The
    store is not here either — a ticket belongs to one shop, so it is stated
    once on the close.
    """

    item_id: str
    price: float | None = None
    price_per: Literal["KILOGRAM"] | None = None
    # The quantity actually bought. Writes purchased_quantity; the planned
    # quantity the household typed is left alone.
    quantity: str | None = None


class PurchaseNewItem(BaseModel):
    """Something bought that was never on the list. Born already purchased."""

    name: str = Field(min_length=1, max_length=200)
    brand: str | None = None
    ean: str | None = None
    price: float | None = None
    price_per: Literal["KILOGRAM"] | None = None
    quantity: str | None = None


class PurchaseClose(BaseModel):
    # Absent means the trip that is still open. Any unreconciled trip on the
    # list can be named, including that same open one. The case it exists for
    # is the other kind: a trip that already tore off, written down later.
    purchase_id: str | None = None
    # Required, and deliberately stricter than the receipt-review screen,
    # which allows an empty one. Whoever closes a purchase was there and
    # knows the shop. The only trip that can lack a store is the cart nobody
    # reconciled, and nobody closes that one -- midnight does.
    store: str = Field(min_length=1, max_length=100)
    # The date control. Absent means now.
    purchased_at: datetime | None = None
    # The figure printed on the paper, never the sum of the lines. A close
    # done by hand has no paper and leaves this NULL, which is what makes the
    # ticket header print an approximation instead of a figure.
    #
    # Deliberately unconstrained here -- no `ge=0`, no `allow_inf_nan=False`.
    # Both range and finiteness are checked in close_purchase instead: a NaN
    # input fails `ge=0` too (NaN comparisons are always False in IEEE 754),
    # so *any* Pydantic constraint that can reject total for being NaN
    # crashes FastAPI's own validation-error handler when it tries to echo
    # the rejected value back in the 422 body -- Starlette's JSONResponse
    # serializes with allow_nan=False. Confirmed empirically. `store` above
    # is safe to constrain because a bounded string has no such value.
    total: float | None = None
    # 200 is a guess, not a convention carried over from elsewhere. No real
    # cart approaches it; it exists only to bound the two fields here that
    # can carry an unbounded payload.
    lines: list[PurchaseLine] = Field(default_factory=list, max_length=200)
    new_items: list[PurchaseNewItem] = Field(default_factory=list, max_length=200)


class PurchaseRead(BaseModel):
    id: str
    list_id: str
    opened_at: datetime
    tears_off_at: datetime
    closed_at: datetime | None
    store: str | None
    total: float | None
