from datetime import datetime

from pydantic import BaseModel


class ListCreate(BaseModel):
    name: str
    emoji: str | None = None


class ListUpdate(BaseModel):
    name: str | None = None
    emoji: str | None = None


class ListUpdatedAtRead(BaseModel):
    updated_at: datetime


class ListMemberBrief(BaseModel):
    """A member as shown on list overviews: id and display name, nothing else.

    Deliberately carries no email and no photo — the overview payload must not
    leak contact details of co-members.
    """

    user_id: str
    display_name: str


class ListRead(BaseModel):
    id: str
    name: str
    emoji: str | None
    owner_id: str
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    purchased_count: int = 0
    # Items purchased today. Interim rule: when the trips entity exists, this
    # becomes "purchased while today's trip is open".
    cart_count: int = 0
    members: list[ListMemberBrief] = []
    # Whether this list is the requesting user's default (Siri target).
    is_default: bool = False
