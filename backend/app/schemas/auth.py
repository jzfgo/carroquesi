from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class UserRead(BaseModel):
    id: str
    email: str
    display_name: str | None
    photo_url: str | None
    features: list[str] = []
    has_api_key: bool = False
    api_key_last_used_at: datetime | None = None
    # None means the user never decided; a non-null value is a decision.
    receipt_consent: Literal["granted", "declined"] | None = None


class ReceiptConsentUpdate(BaseModel):
    consent: Literal["granted", "declined"]
