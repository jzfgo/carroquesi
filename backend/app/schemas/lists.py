from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# The board palette, as the API validates it. Must stay in step with
# list_board.BOARDS (the assignment order) — a test pins the two together.
Board = Literal["kraft", "lino", "salvia", "niebla", "barro", "pizarra"]


class BoardPrefUpdate(BaseModel):
    board: Board


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
    # The requesting user's board for this list — personal, never another
    # member's. Populated (and lazily assigned) only on the single-list GET;
    # the panel listing and create leave it null.
    board: str | None = None
