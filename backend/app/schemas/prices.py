from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PriceCreate(BaseModel):
    amount: float = Field(gt=0)
    price_per: Literal["KILOGRAM"] | None = None  # None = per unit, "KILOGRAM" = per kg
    store: str | None = None


class PriceEntry(BaseModel):
    amount: float | None  # None = "sin precio": bought, price unconfirmed
    price_per: Literal["KILOGRAM"] | None  # None = per unit, "KILOGRAM" = per kg
    store: str | None
    purchased_at: datetime | None = None
    quantity: str | None = None
    is_sin_precio: bool = False
    # A price from a reduced label: kept out of the minimum, the chart line
    # and the close sheet's suggestion, but still the last price paid.
    reduced: bool = False
    price_before: float | None = None


class PriceHistoryResponse(BaseModel):
    entries: list[PriceEntry]
