from datetime import datetime

from pydantic import BaseModel


class SuggestionRead(BaseModel):
    name: str
    brand: str | None
    stores: list[str]


class ElsewhereMatchRead(BaseModel):
    """The searched name found on another list the caller belongs to."""

    list_id: str
    list_name: str
    last_purchased_at: datetime | None
