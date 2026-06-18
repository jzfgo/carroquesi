import uuid
from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class WaitlistSignup(SQLModel, table=True):
    __tablename__ = "waitlist_signups"

    id: str = Field(default_factory=_uuid, primary_key=True)
    email: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=_now)
    allowed_at: datetime | None = Field(default=None, nullable=True)
    invite_token: str | None = Field(default=None, nullable=True)

