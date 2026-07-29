from datetime import datetime

from pydantic import BaseModel, Field


class PurchaseClose(BaseModel):
    # None means "everything in the cart" — the ordinary one-shop evening.
    # A list means "this shop was these lines", which is what turns two
    # simultaneous shops into two tickets.
    # 200 is a guess, not a convention carried over from elsewhere — same
    # spirit as `store`'s max_length below. No real cart approaches this;
    # it exists only to bound the one field here that can carry an
    # unbounded payload (`store` and `total` are both already bounded).
    item_ids: list[str] | None = Field(default=None, max_length=200)
    # 100 is a guess, not a convention carried over from elsewhere -- no
    # other user-supplied string field in this codebase is length-bounded at
    # the schema level (checked app/schemas/, app/db/models.py, and every
    # alembic migration). It exists only to keep an unbounded paste from
    # landing in the ticket header this renders in. The `purchases.store`
    # column itself stays an unbounded String() -- this is an input guard,
    # not a schema change, and needs no migration.
    store: str | None = Field(default=None, max_length=100)
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
