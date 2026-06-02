from pydantic import BaseModel


class UserRead(BaseModel):
    id: str
    email: str
    display_name: str | None
    photo_url: str | None
    features: list[str] = []
