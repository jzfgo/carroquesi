from pydantic import BaseModel, Field


class StoreRead(BaseModel):
    store_key: str
    display_name: str


class StoreRename(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)
