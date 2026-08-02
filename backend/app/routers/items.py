import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import case, func, nulls_last, or_
from sqlmodel import Session, select

from app.db.models import List, ListItem, Purchase, User
from app.dependencies import CurrentSession, MemberDep, MemberOrDefaultDep
from app.schemas.items import ItemCreate, ItemRead, ItemUpdate
from app.services import trips
from app.services.client_day import ClientTimezone
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
    lst.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(lst)


def _notify_safely(session: Session, lst: List, actor: User, event: str, name: str) -> None:
    """Push is best-effort. A notification failure must never fail a list write."""
    try:
        notify_list_change(session, lst, actor, event, name)
    except Exception:  # pragma: no cover - notify_list_change already swallows
        logger.exception("push notification failed for list %s", lst.id)


@router.get("", response_model=list[ItemRead])
def get_items(
    list_id: str,
    list_and_user: MemberOrDefaultDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    purchased_group = case((ListItem.purchased_at.is_(None), 0), else_=1)
    query = (
        select(ListItem)
        .where(ListItem.list_id == lst.id)
        .order_by(
            purchased_group,
            nulls_last(ListItem.purchased_at.desc()),
            ListItem.created_at.asc(),
        )
    )
    items = session.exec(query).all()
    _attach_purchase_ends_at(session, items)
    return items


def _attach_purchase_ends_at(session: Session, items: list[ListItem]) -> None:
    """Stamp each item with its trip's end instant, in one query for the page.

    The value rides on the ORM object as a transient attribute (the way
    User.is_admin does) and ItemRead picks it up; items without a trip keep
    the schema's None default.
    """
    trip_ids = {item.purchase_id for item in items if item.purchase_id is not None}
    if not trip_ids:
        return
    trips_by_id = {
        trip.id: trip
        for trip in session.exec(select(Purchase).where(Purchase.id.in_(trip_ids))).all()
    }
    for item in items:
        trip = trips_by_id.get(item.purchase_id) if item.purchase_id else None
        if trip is not None:
            # object.__setattr__ because pydantic rejects undeclared fields.
            object.__setattr__(item, "purchase_ends_at", trips.ends_at(trip))


@router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
def add_item(
    body: ItemCreate,
    list_and_user: MemberOrDefaultDep,
    session: CurrentSession,
):
    lst, current_user = list_and_user
    conditions = [func.trim(func.lower(ListItem.name)) == body.name.strip().lower()]
    if body.ean is not None:
        conditions.append(ListItem.ean == body.ean)
    duplicate = session.exec(
        select(ListItem)
        .where(ListItem.list_id == lst.id, ListItem.purchased_at.is_(None))
        .where(or_(*conditions))
        .limit(1)
    ).first()
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Item already in list")
    item = ListItem(list_id=lst.id, added_by=current_user.id, **body.model_dump())
    session.add(item)
    ensure_stores(session, lst.id, body.stores)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
    _notify_safely(session, lst, current_user, "added", item.name)
    return item


@router.patch("/{item_id}", response_model=ItemRead)
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
    for field, value in data.items():
        setattr(item, field, value)
    if data.get("stores"):
        ensure_stores(session, lst.id, data["stores"])
    if purchased is True and item.purchased_at is None:
        now = datetime.now(UTC).replace(tzinfo=None)
        item.purchased_at = now
        item.purchased_by = current_user.id
        item.purchase_id = trips.open_trip_for(session, lst.id, now, client_tz).id
    elif purchased is False:
        if item.purchased_at is not None:
            now = datetime.now(UTC).replace(tzinfo=None)
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
        if emptied_trip_id is not None:
            # An unreconciled trip this emptied would otherwise linger and
            # silently swallow later taps, so it goes with its last item. A
            # closed trip is a historical record and stays, empty or not.
            trip = session.get(Purchase, emptied_trip_id)
            still_used = session.exec(
                select(ListItem).where(ListItem.purchase_id == emptied_trip_id).limit(1)
            ).first()
            if trip is not None and trip.closed_at is None and still_used is None:
                session.delete(trip)
    item.updated_at = datetime.now(UTC).replace(tzinfo=None)
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


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: str,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    item = session.get(ListItem, item_id)
    if item is None or item.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    session.delete(item)
    _bump(lst, session)
    session.commit()
