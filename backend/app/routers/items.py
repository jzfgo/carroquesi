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
from app.services.pack_from_name import (
    drop_format_when_weighed,
    fill_from_name,
    fill_from_off,
)
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
_FORMAT_FIELDS = frozenset({"pack", "pack_source", "ean"})
_LINE_FIELDS = _FORMAT_FIELDS | {"name", "brand", "quantity", "stores"}


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(UTC)
    session.add(lst)


def _notify_safely(session: Session, lst: List, actor: User, event: str, name: str) -> None:
    """Push is best-effort. A notification failure must never fail a list write."""
    try:
        notify_list_change(session, lst, actor, event, name)
    except Exception:
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


_GUESSED_FROM_A_CODE = ("off", "copied")


def _format_from_ean(session: Session, item: ListItem, ean: str) -> None:
    """The format a code brings to a line with none: the list's own last
    line with that code first, then the size Open Food Facts gives.

    A format an earlier code guessed named that code's product, so the new
    code's format replaces it. When the new code brings none, the old guess
    stays. A format typed, read in the name or on a receipt always stays."""
    kept = None
    if item.pack_source in _GUESSED_FROM_A_CODE:
        kept = (item.pack_count, item.pack_content, item.pack_content_unit, item.pack_source)
        for column, value in pack_columns(None).items():
            setattr(item, column, value)
    _take_format_of_ean(session, item, ean)
    # The cache is warm here: a scan looks the code up before it saves it.
    cached = session.exec(select(BarcodeCache).where(BarcodeCache.ean == ean)).first()
    fill_from_off(item, cached.quantity if cached else None)
    if kept is not None and item.pack is None:
        item.pack_count, item.pack_content, item.pack_content_unit, item.pack_source = kept


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
        _format_from_ean(session, item, body.ean)
    fill_from_name(item)
    drop_format_when_weighed(item)
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
    # A correction describes the product, not the purchase, so it must not
    # reopen the un-purchase grace window. A format is never a write; the
    # other fields are one only while the line is still pending.
    corrected = _LINE_FIELDS if was_purchased else _FORMAT_FIELDS
    correction_only = bool(data) and purchased is None and data.keys() <= corrected
    # A repeat purchase (Siri, a retried request) changes nothing. Stamping it
    # would reopen the un-purchase grace window on a closed trip.
    repeat_purchase = purchased is True and was_purchased and not data
    pack_source = data.pop("pack_source", None)
    # Read before the format: a new format clears the code, and a request
    # that sends the same code back has not changed it.
    new_ean = "ean" in data and data["ean"] is not None and data["ean"] != item.ean
    if "pack" in data:
        data.pop("pack")
        # Whole, not exclude_unset: a field left out of the format is a default,
        # not "keep". A scan in this request sets the EAN after it is cleared.
        before = item.pack
        item.change_pack(body.pack.model_dump() if body.pack else None)
        # Only a format this request changed takes the source it names:
        # relabelling a typed format as a guess would let a rename replace it.
        if pack_source is not None and item.pack is not None and item.pack != before:
            item.pack_source = pack_source
    for field, value in data.items():
        setattr(item, field, value)
    if new_ean:
        # The same rule as a new line.
        _format_from_ean(session, item, data["ean"])
    if "name" in data and "pack" not in body.model_fields_set:
        fill_from_name(item)
    drop_format_when_weighed(item)
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
    if not correction_only and not repeat_purchase:
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
