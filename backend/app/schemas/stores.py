from pydantic import BaseModel, Field, field_validator


class StoreRead(BaseModel):
    store_key: str
    display_name: str


class StoreRename(BaseModel):
    display_name: str = Field(max_length=100)

    @field_validator("display_name")
    @classmethod
    def display_name_must_not_be_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Display name cannot be blank")
        return trimmed
