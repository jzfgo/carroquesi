from datetime import datetime

from pydantic import BaseModel, Field


class PurchaseClose(BaseModel):
    # None means "everything in the cart" — the ordinary one-shop evening.
    # A list means "this shop was these lines", which is what turns two
    # simultaneous shops into two tickets.
    item_ids: list[str] | None = None
    store: str | None = None
    total: float | None = Field(default=None, ge=0)


class PurchaseRead(BaseModel):
    id: str
    list_id: str
    opened_at: datetime
    tears_off_at: datetime
    closed_at: datetime | None
    store: str | None
    total: float | None
