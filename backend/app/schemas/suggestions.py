from pydantic import BaseModel


class SuggestionRead(BaseModel):
    name: str
    brand: str | None
    variety: str | None
    stores: list[str]
