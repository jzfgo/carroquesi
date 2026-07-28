import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, Column, UniqueConstraint, text
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
    # Per-user default list, used to resolve the Siri Shortcut's literal
    # list_id="default". At most one membership per user carries this flag;
    # the invariant is enforced in-app within each mutating transaction
    # (see app/services/default_list.py), not by a DB constraint.
    is_default: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default=text("0"))
    )
    # Watermark: when this member last actually looked at the list. Drives the
    # unseen count in push notifications. NULL means "never opened since joining";
    # resolved with COALESCE(last_seen_at, created_at). See ADR-010.
    last_seen_at: datetime | None = Field(default=None)


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
    purchased_by: str | None = Field(default=None, foreign_key="users.id")
    added_by: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    ean: str | None = Field(default=None)
    price: float | None = Field(default=None)
    price_per: str | None = Field(default=None)
    price_store: str | None = Field(default=None)
    # The trip this was bought on — not another "purchased_*" attribute of the
    # item. NULL means unpurchased, which is most rows; the invariant
    # "purchased => purchase_id set" is enforced in-app, the way
    # list_members.is_default is.
    purchase_id: str | None = Field(default=None, foreign_key="purchases.id", index=True)


class Purchase(SQLModel, table=True):
    """A shopping trip: what the household says the shop was.

    Deliberately not merged into ReceiptScan. A ReceiptScan is *parsed
    evidence* — what the OCR read, possibly wrong, possibly abandoned before
    anything was applied. A Purchase is *confirmed truth*. Collapse the two and
    a bad OCR read silently overwrites a total someone confirmed, with no error
    message. See docs/decisions/011-purchase-entity-and-trip-boundary.md.
    """

    __tablename__ = "purchases"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id", index=True)
    opened_at: datetime = Field(default_factory=_now)
    # Local midnight after opened_at, in app.services.trips.TRIP_TIMEZONE.
    # Stamped at creation so the tear-off is an instant comparison everywhere
    # else — and so revisiting the policy later cannot re-file trips that have
    # already torn off.
    tears_off_at: datetime
    # Set only by an explicit reconciliation. NULL with tears_off_at in the
    # past means nobody wrote this shop down; the paper simply got torn.
    closed_at: datetime | None = Field(default=None)
    store: str | None = None
    # Confirmed from the receipt — never the sum of the lines. A trip whose
    # total was never confirmed keeps NULL, and the UI says so with ≥.
    total: float | None = Field(default=None)


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
    receipt_at: datetime | None = None
    receipt_total: float | None = None
    parsed_lines: list[dict] | None = Field(default=None, sa_column=Column(JSON))
    match_result: list[dict] | None = Field(default=None, sa_column=Column(JSON))
    items_updated: int = 0
    created_at: datetime = Field(default_factory=_now)
    # The trip this scan reconciled, when it reconciled exactly one. NULL when
    # the matches spanned several — scan_receipt matches across a ±3 day
    # window, so that is reachable.
    # Unindexed on purpose: nothing queries scans by trip yet. Add one when
    # something does — Postgres will not create it for you.
    purchase_id: str | None = Field(default=None, foreign_key="purchases.id")


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
    last_used_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)


class PushToken(SQLModel, table=True):
    __tablename__ = "push_tokens"

    id: str = Field(default_factory=_uuid, primary_key=True)
    # Indexed: the send path resolves tokens by user on every qualifying write,
    # and Postgres does not index FK columns automatically.
    user_id: str = Field(foreign_key="users.id", index=True)
    token: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=_now)
    # Named last_registered_at, not last_seen_at, to avoid colliding with the
    # ListMember.last_seen_at read watermark — they mean different things.
    last_registered_at: datetime = Field(default_factory=_now)
