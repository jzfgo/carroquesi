import logging
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import case, nulls_last
from sqlmodel import Session, col, select

from app.db.models import (
    BarcodeCache,
    List,
    ListItem,
    Purchase,
    ReceiptScan,
    User,
    pack_columns,
)
from app.dependencies import CurrentSession, MemberDep, MemberOrDefaultDep
from app.schemas.items import ItemCreate, ItemRead, ItemUpdate
from app.services import trips
from app.services.bought_by_weight import mark_bought_by_weight
from app.services.client_day import ClientTimezone
from app.services.pack_from_name import fill_from_name, fill_from_off
from app.services.pending_duplicate import find_pending_duplicate
from app.services.push import notify_list_change
from app.services.store_registry import ensure_stores

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lists/{list_id}/items", tags=["items"])

# A purchase from a receipt scan is backdated to the shopping trip, so the
# trip-open rule alone would make a wrong receipt link permanent the moment
# it is made. A record written moments ago can still be reverted: the user
# is undoing their own fresh write, not rewriting historical spend.
UNPURCHASE_GRACE = timedelta(minutes=15)


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(UTC)
    session.add(lst)


def _notify_safely(session: Session, lst: List, actor: User, event: str, name: str) -> None:
    """Push is best-effort. A notification failure must never fail a list write."""
    try:
        notify_list_change(session, lst, actor, event, name)
    except Exception:  # pragma: no cover - notify_list_change already swallows
        logger.exception("push notification failed for list %s", lst.id)


def get_items(
    list_id: str,
    list_and_user: MemberOrDefaultDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    purchased_group = case((col(ListItem.purchased_at).is_(None), 0), else_=1)
    query = (
        select(ListItem)
        .where(ListItem.list_id == lst.id)
        .order_by(
            purchased_group,
            nulls_last(col(ListItem.purchased_at).desc()),
            col(ListItem.created_at).asc(),
        )
    )
    items = session.exec(query).all()
    _attach_purchase_ends_at(session, items)
    mark_bought_by_weight(session, lst.id, items)
    return items


router.get("", response_model=list[ItemRead])(get_items)


def _attach_purchase_ends_at(session: Session, items: Sequence[ListItem]) -> None:
    """Stamp each item with its trip's facts, in two queries for the page.

    The end instant, the trip's store, and whether a scan claimed the trip ride on the ORM object
    as transient attributes (the way User.is_admin does) and ItemRead picks
    them up; items without a trip keep the schema's defaults.
    """
    trip_ids = {item.purchase_id for item in items if item.purchase_id is not None}
    if not trip_ids:
        return
    trips_by_id = {
        trip.id: trip
        for trip in session.exec(select(Purchase).where(col(Purchase.id).in_(trip_ids))).all()
    }
    scanned = set(
        session.exec(
            select(ReceiptScan.purchase_id)
            .where(col(ReceiptScan.purchase_id).in_(trip_ids))
            .distinct()
        ).all()
    )
    for item in items:
        trip = trips_by_id.get(item.purchase_id) if item.purchase_id else None
        if trip is not None:
            # object.__setattr__ because pydantic rejects undeclared fields.
            object.__setattr__(item, "purchase_ends_at", trips.ends_at(trip))
            object.__setattr__(item, "purchase_has_receipt", trip.id in scanned)
            object.__setattr__(item, "purchase_store", trip.store)


def _take_format_of_ean(session: Session, item: ListItem, ean: str) -> None:
    """An EAN names one format, so a scanned code brings the format the
    list's last line with that code carried. Only this list's lines: another
    household's are not ours to read. The format comes as a guess, even
    when it was typed on that line: a typed format is protected on the line
    it was typed on, not on the lines that copy it. A line created with a
    format of its own keeps it."""
    if item.pack is not None:
        return
    source = session.exec(
        select(ListItem)
        .where(
            ListItem.list_id == item.list_id,
            ListItem.ean == ean,
            # The same test as `ListItem.pack`: one piece with no content is no format.
            (col(ListItem.pack_content).is_not(None)) | (col(ListItem.pack_count) > 1),
        )
        .order_by(col(ListItem.updated_at).desc())
    ).first()
    if source is not None:
        item.pack_count = source.pack_count
        item.pack_content = source.pack_content
        item.pack_content_unit = source.pack_content_unit
        item.pack_source = "copied"


def add_item(
    body: ItemCreate,
    list_and_user: MemberOrDefaultDep,
    session: CurrentSession,
):
    lst, current_user = list_and_user
    item = ListItem(
        list_id=lst.id,
        added_by=current_user.id,
        **body.model_dump(exclude={"pack"}),
        **pack_columns(body.pack.model_dump() if body.pack else None),
    )
    if body.ean:
        _take_format_of_ean(session, item, body.ean)
        # The list's own lines first. The cache is warm here: a scan looks
        # the code up before it adds the line.
        cached = session.exec(select(BarcodeCache).where(BarcodeCache.ean == body.ean)).first()
        fill_from_off(item, cached.quantity if cached else None)
    fill_from_name(item)
    # After the format leaves the name: «Agua 6x1,5L» is the pending «Agua».
    if find_pending_duplicate(session, lst.id, item.name, item.ean) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Item already in list")
    session.add(item)
    ensure_stores(session, lst.id, body.stores)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
    _notify_safely(session, lst, current_user, "added", item.name)
    return item


router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)(add_item)


def update_item(
    item_id: str,
    body: ItemUpdate,
    list_and_user: MemberOrDefaultDep,
    session: CurrentSession,
    client_tz: ClientTimezone,
):
    lst, current_user = list_and_user
    item = session.get(ListItem, item_id)
    if item is None or item.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    was_purchased = item.purchased_at is not None
    data = body.model_dump(exclude_unset=True)
    purchased = data.pop("purchased", None)
    # Only a format correction: allowed on a closed purchase, and not a write
    # to the purchase, so it must not reopen the un-purchase grace window.
    format_only = bool(data) and purchased is None and data.keys() <= {"pack", "ean"}
    if "pack" in data:
        data.pop("pack")
        # Whole, not exclude_unset: a field left out of the format is a default,
        # not "keep". A scan in this request sets the EAN after it is cleared.
        item.change_pack(body.pack.model_dump() if body.pack else None)
    for field, value in data.items():
        setattr(item, field, value)
    if "name" in data and "pack" not in body.model_fields_set:
        fill_from_name(item)
    if data.get("stores"):
        ensure_stores(session, lst.id, data["stores"])
    if purchased is True and item.purchased_at is None:
        now = datetime.now(UTC)
        item.purchased_at = now
        item.purchased_by = current_user.id
        item.purchase_id = trips.open_trip_for(session, lst.id, now, client_tz).id
    elif purchased is False:
        if item.purchased_at is not None:
            now = datetime.now(UTC)
            # A purchased item whose trip row is missing counts as closed:
            # better to refuse an undo than to reopen spend nobody can date.
            # The grace window below still rescues a fresh write.
            trip = session.get(Purchase, item.purchase_id) if item.purchase_id else None
            trip_open = trip is not None and trips.is_open(trip, now)
            recently_written = now - item.updated_at <= UNPURCHASE_GRACE
            if not trip_open and not recently_written:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot unpurchase an item from a closed trip",
                )
        item.purchased_at = None
        emptied_trip_id, item.purchase_id = item.purchase_id, None
        trips.prune_if_empty(session, emptied_trip_id)
    if not format_only:
        item.updated_at = datetime.now(UTC)
    session.add(item)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
    _attach_purchase_ends_at(session, [item])
    # Only NULL -> set notifies. Un-purchasing is a correction, and corrections
    # should not buzz every member's phone.
    if not was_purchased and item.purchased_at is not None:
        _notify_safely(session, lst, current_user, "purchased", item.name)
    return item


router.patch("/{item_id}", response_model=ItemRead)(update_item)


def delete_item(
    item_id: str,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    item = session.get(ListItem, item_id)
    if item is None or item.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    trip_id = item.purchase_id
    session.delete(item)
    trips.prune_if_empty(session, trip_id)
    _bump(lst, session)
    session.commit()


router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)(delete_item)
