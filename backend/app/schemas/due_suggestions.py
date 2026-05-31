from pydantic import BaseModel


class DueSuggestionRead(BaseModel):
    name: str
    brand: str | None
    stores: list[str]
    days_overdue: float        # days past the 0.9× threshold
    dismissal_ttl_days: float  # (1.5 × median_interval) - days_since_last
    median_interval_days: float
    days_since_last: float
    avg_quantity: int | None
