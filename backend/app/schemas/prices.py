from datetime import datetime
from pydantic import BaseModel, ConfigDict


class PriceCreate(BaseModel):
    amount: float
    price_per: str | None = None  # None = per unit, "KILOGRAM" = per kg
    store: str | None = None


class PriceRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    list_item_id: str
    ean: str | None
    amount: float
    price_per: str | None
    store: str | None
    user_id: str
    recorded_at: datetime


class StoreGroup(BaseModel):
    store: str | None
    records: list[PriceRecordRead]


class PriceHistoryResponse(BaseModel):
    groups: list[StoreGroup]
    community_price: float | None = None
    community_price_per: str | None = None
