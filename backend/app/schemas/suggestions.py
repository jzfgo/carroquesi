from typing import Optional

from pydantic import BaseModel


class SuggestionRead(BaseModel):
    name: str
    brand: Optional[str]
    variety: Optional[str]
    store: Optional[str]
