from datetime import datetime

from pydantic import BaseModel


class UserRead(BaseModel):
    id: str
    email: str
    display_name: str | None
    photo_url: str | None
    features: list[str] = []
    has_api_key: bool = False
    api_key_last_used_at: datetime | None = None
