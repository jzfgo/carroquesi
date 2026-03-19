from pydantic import BaseModel


class SuggestionRead(BaseModel):
    name: str
    brand: str | None
    variety: str | None
    store: str | None
