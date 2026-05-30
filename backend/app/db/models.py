import uuid
from datetime import datetime, date as date_type, timezone
from typing import Optional

from sqlalchemy import Column, JSON, UniqueConstraint, text
from sqlmodel import Field, SQLModel


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(default_factory=_uuid, primary_key=True)
    firebase_uid: str = Field(unique=True, index=True)
    display_name: Optional[str] = None
    email: str = Field(unique=True, index=True)
    photo_url: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)


class List(SQLModel, table=True):
    __tablename__ = "lists"

    id: str = Field(default_factory=_uuid, primary_key=True)
    name: str
    emoji: Optional[str] = None
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
    quantity: Optional[str] = None
    brand: Optional[str] = None
    stores: list[str] = Field(default_factory=list, sa_column=Column(JSON, server_default=text("'[]'")))
    purchased_at: Optional[datetime] = Field(default=None)
    added_by: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    ean: Optional[str] = Field(default=None)
    price: Optional[float] = Field(default=None)
    price_per: Optional[str] = Field(default=None)
    price_store: Optional[str] = Field(default=None)


class ListInvite(SQLModel, table=True):
    __tablename__ = "list_invites"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id")
    invited_email: Optional[str] = None
    invited_by: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)


class BarcodeCache(SQLModel, table=True):
    __tablename__ = "barcode_cache"

    id: str = Field(default_factory=_uuid, primary_key=True)
    ean: str = Field(unique=True, index=True)
    name: str
    brand: Optional[str] = None
    stores: Optional[str] = None  # nullable comma-separated, e.g. "Mercadona,Alcampo"
    created_at: datetime = Field(default_factory=_now)


class PriceCache(SQLModel, table=True):
    __tablename__ = "price_cache"

    id: str = Field(default_factory=_uuid, primary_key=True)
    ean: str = Field(unique=True, index=True)
    amount: Optional[float] = Field(default=None)  # None = fetched but no usable data (negative cache)
    price_per: Optional[str] = Field(default=None)  # None=unit, "KILOGRAM"=per kg
    fetched_at: datetime = Field(default_factory=_now)


class ReceiptScan(SQLModel, table=True):
    __tablename__ = "receipt_scans"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id")
    scanned_by: str = Field(foreign_key="users.id")
    store: Optional[str] = None
    receipt_date: Optional[date_type] = None
    receipt_total: Optional[float] = None
    parsed_lines: Optional[list] = Field(default=None, sa_column=Column(JSON))
    match_result: Optional[list] = Field(default=None, sa_column=Column(JSON))
    items_updated: int = 0
    created_at: datetime = Field(default_factory=_now)


class ReceiptNameMapping(SQLModel, table=True):
    __tablename__ = "receipt_name_mappings"
    __table_args__ = (UniqueConstraint("store", "receipt_name"),)

    id: str = Field(default_factory=_uuid, primary_key=True)
    store: str
    receipt_name: str
    item_name: str
    item_brand: Optional[str] = None
    confirmed_by: str = Field(foreign_key="users.id")
    use_count: int = 1
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class FeedbackSubmission(SQLModel, table=True):
    __tablename__ = "feedback_submissions"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id")
    message: str
    email: Optional[str] = None
    source: str = Field(default="manual")
    user_agent: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
