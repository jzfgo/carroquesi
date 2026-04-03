from pydantic import BaseModel


class SuggestionRead(BaseModel):
    name: str
    brand: str | None
    stores: list[str]
