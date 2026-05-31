from pydantic import BaseModel


class DueSuggestionRead(BaseModel):
    name: str
    brand: str | None
    stores: list[str]
    days_overdue: float
    dismissal_ttl_days: float
    median_interval_days: float
    days_since_last: float
