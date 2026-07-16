import uuid
from datetime import UTC, datetime
from datetime import date as date_type

from sqlalchemy import JSON, Column, UniqueConstraint, text
from sqlmodel import Field, SQLModel

from app.db.waitlist_models import WaitlistSignup  # noqa: F401


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(default_factory=_uuid, primary_key=True)
    firebase_uid: str = Field(unique=True, index=True)
    display_name: str | None = None
    email: str = Field(unique=True, index=True)
    photo_url: str | None = None
    created_at: datetime = Field(default_factory=_now)


class List(SQLModel, table=True):
    __tablename__ = "lists"

    id: str = Field(default_factory=_uuid, primary_key=True)
    name: str
    emoji: str | None = None
    owner_id: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ListMember(SQLModel, table=True):
    __tablename__ = "list_members"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id")
    user_id: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)


class ListItem(SQLModel, table=True):
    __tablename__ = "list_items"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id")
    name: str
    quantity: str | None = None
    purchased_quantity: str | None = None
    brand: str | None = None
    stores: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, server_default=text("'[]'"))
    )
    purchased_at: datetime | None = Field(default=None)
    added_by: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    ean: str | None = Field(default=None)
    price: float | None = Field(default=None)
    price_per: str | None = Field(default=None)
    price_store: str | None = Field(default=None)


class ListInvite(SQLModel, table=True):
    __tablename__ = "list_invites"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id")
    invited_email: str | None = None
    invited_by: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)


class BarcodeCache(SQLModel, table=True):
    __tablename__ = "barcode_cache"

    id: str = Field(default_factory=_uuid, primary_key=True)
    ean: str = Field(unique=True, index=True)
    name: str
    brand: str | None = None
    stores: str | None = None  # nullable comma-separated, e.g. "Mercadona,Alcampo"
    created_at: datetime = Field(default_factory=_now)


class PriceCache(SQLModel, table=True):
    __tablename__ = "price_cache"

    id: str = Field(default_factory=_uuid, primary_key=True)
    ean: str = Field(unique=True, index=True)
    amount: float | None = Field(default=None)  # None = fetched but no usable data (negative cache)
    price_per: str | None = Field(default=None)  # None=unit, "KILOGRAM"=per kg
    fetched_at: datetime = Field(default_factory=_now)


class ReceiptScan(SQLModel, table=True):
    __tablename__ = "receipt_scans"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id")
    scanned_by: str = Field(foreign_key="users.id")
    store: str | None = None
    receipt_date: date_type | None = None
    receipt_total: float | None = None
    parsed_lines: list[dict] | None = Field(default=None, sa_column=Column(JSON))
    match_result: list[dict] | None = Field(default=None, sa_column=Column(JSON))
    items_updated: int = 0
    created_at: datetime = Field(default_factory=_now)


class ReceiptNameMapping(SQLModel, table=True):
    __tablename__ = "receipt_name_mappings"
    __table_args__ = (UniqueConstraint("store", "receipt_name"),)

    id: str = Field(default_factory=_uuid, primary_key=True)
    store: str
    receipt_name: str
    item_name: str
    item_brand: str | None = None
    confirmed_by: str = Field(foreign_key="users.id")
    use_count: int = 1
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class FeedbackSubmission(SQLModel, table=True):
    __tablename__ = "feedback_submissions"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id")
    message: str
    email: str | None = None
    source: str = Field(default="manual")
    user_agent: str | None = None
    created_at: datetime = Field(default_factory=_now)


class UserFeature(SQLModel, table=True):
    __tablename__ = "user_features"
    __table_args__ = (UniqueConstraint("user_id", "feature"),)

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    feature: str
    enabled: bool = True
    granted_by: str
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ApiKey(SQLModel, table=True):
    __tablename__ = "api_keys"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id", unique=True)
    key_hash: str = Field(unique=True, index=True)
    key_ciphertext: str
    last_used_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)
