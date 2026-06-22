from typing import Literal

from pydantic import BaseModel, Field


class PriceCreate(BaseModel):
    amount: float = Field(gt=0)
    price_per: Literal["KILOGRAM"] | None = None  # None = per unit, "KILOGRAM" = per kg
    store: str | None = None


class PriceEntry(BaseModel):
    amount: float
    price_per: str | None
    store: str | None
    purchased_at: str | None = None
    quantity: str | None = None


class PriceHistoryResponse(BaseModel):
    entries: list[PriceEntry]
    community_price: float | None = None
    community_price_per: str | None = None
