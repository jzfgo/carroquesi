from datetime import datetime

from pydantic import BaseModel


class PurchaseClose(BaseModel):
    # None means "everything in the cart" — the ordinary one-shop evening.
    # A list means "this shop was these lines", which is what turns two
    # simultaneous shops into two tickets.
    item_ids: list[str] | None = None
    store: str | None = None
    # Deliberately unconstrained here -- no `ge=0`, no `allow_inf_nan=False`.
    # Both range and finiteness are checked in close_purchase
    # (routers/purchases.py) instead: a NaN input fails `ge=0` too (NaN
    # comparisons are always False in IEEE 754), so *any* Pydantic constraint
    # that can reject total for being NaN crashes FastAPI's own
    # validation-error handler when it tries to echo the rejected value back
    # in the 422 body -- Starlette's JSONResponse serializes with
    # allow_nan=False. Confirmed empirically. The only way to avoid that for
    # every non-finite input is to never let Pydantic raise on this field at
    # all, and check it in plain Python once it's already a value we hold.
    total: float | None = None


class PurchaseRead(BaseModel):
    id: str
    list_id: str
    opened_at: datetime
    tears_off_at: datetime
    closed_at: datetime | None
    store: str | None
    total: float | None
