import logging
import math
from datetime import UTC, datetime, time
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, or_
from sqlmodel import select

from app.db.models import List, ListItem, Purchase, ReceiptScan, User
from app.dependencies import CurrentSession, MemberDep
from app.schemas.items import ItemRead
from app.schemas.purchases import (
    PurchaseCloseBody,
    PurchaseManualBody,
    PurchasePage,
    PurchaseRead,
    PurchaseSummary,
)
from app.services import trips
from app.services.client_day import ClientTimezone
from app.services.push import notify_list_change
from app.services.quantity import parse_quantity_factor
from app.services.store_registry import ensure_stores

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lists/{list_id}/purchases", tags=["purchases"])


def _notify_safely(session, lst: List, actor: User, event: str, name: str) -> None:
    """Push is best-effort: a notification failure must never fail the write.

    Closing a trip deliberately fires nothing (see close_purchase), but a
    re-buy is an item creation — it puts a product back on the pending list,
    exactly like add_item — so it notifies on the same "added" event.
    """
    try:
        notify_list_change(session, lst, actor, event, name)
    except Exception:  # pragma: no cover - notify_list_change already swallows
        logger.exception("push notification failed for list %s", lst.id)


@router.get("", response_model=PurchasePage)
def list_purchases(
    session: CurrentSession,
    list_and_user: MemberDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """The list's trips, newest shop first.

    The sort key is when each trip stopped (or will stop) taking items —
    the same instant the trip-open rule compares against. An open cart's
    boundary is in the future, so it naturally sorts first; a trip that
    tore off with nobody writing it down sorts by the day it covered, not
    by whenever someone later looks at it. The id tie-break keeps pages
    stable when two trips share a boundary.
    """
    lst, _ = list_and_user
    stopped_at = func.coalesce(Purchase.closed_at, Purchase.tears_off_at)
    page = list(
        session.exec(
            select(Purchase)
            .where(Purchase.list_id == lst.id)
            .order_by(stopped_at.desc(), Purchase.id.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )
    total = session.exec(
        select(func.count()).select_from(Purchase).where(Purchase.list_id == lst.id)
    ).one()

    # Grouped lookups for the whole page rather than one query per row.
    line_counts: dict[str, int] = {}
    scanned: set[str] = set()
    items_totals: dict[str, float] = {}
    if page:
        page_ids = [trip.id for trip in page]
        line_counts = dict(
            session.exec(
                select(ListItem.purchase_id, func.count())
                .where(ListItem.purchase_id.in_(page_ids))
                .group_by(ListItem.purchase_id)
            ).all()
        )
        scanned = set(
            session.exec(
                select(ReceiptScan.purchase_id)
                .where(ReceiptScan.purchase_id.in_(page_ids))
                .distinct()
            ).all()
        )
        # The provisional total per trip: sum each priced line's `price *
        # factor` (the line's real amount, matching the row the app draws), not
        # the raw price. The factor needs the quantity string parsed, so it is
        # computed in Python rather than SQL. A line whose factor cannot apply
        # (a per-kg price with no SI unit) contributes nothing; a trip with no
        # contributing line stays absent, so its items_total serializes as None.
        acc: dict[str, float] = {}
        priced_lines = session.exec(
            select(
                ListItem.purchase_id,
                ListItem.price,
                ListItem.price_per,
                ListItem.quantity,
            ).where(
                ListItem.purchase_id.in_(page_ids),
                ListItem.price.isnot(None),
            )
        ).all()
        for purchase_id, price, price_per, quantity in priced_lines:
            factor = parse_quantity_factor(quantity, price_per)
            if factor is None:
                continue
            acc[purchase_id] = acc.get(purchase_id, 0.0) + price * factor
        items_totals = {pid: round(amount, 2) for pid, amount in acc.items()}

    return PurchasePage(
        purchases=[
            PurchaseSummary(
                **trip.model_dump(),
                line_count=line_counts.get(trip.id, 0),
                has_receipt=trip.id in scanned,
                items_total=items_totals.get(trip.id),
            )
            for trip in page
        ],
        total=total,
    )


@router.get("/{purchase_id}/items", response_model=list[ItemRead])
def get_purchase_items(
    purchase_id: str,
    session: CurrentSession,
    list_and_user: MemberDep,
):
    """The lines of one ticket, in the order they went into the cart."""
    lst, _ = list_and_user
    trip = session.get(Purchase, purchase_id)
    if trip is None or trip.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
    items = session.exec(
        select(ListItem)
        .where(ListItem.purchase_id == trip.id)
        .order_by(ListItem.purchased_at.asc(), ListItem.created_at.asc())
    ).all()
    # One trip, so its boundary is computed once — no need for the grouped
    # lookup the items feed does.
    ends_at = trips.ends_at(trip)
    for item in items:
        # object.__setattr__ because pydantic rejects undeclared fields.
        object.__setattr__(item, "purchase_ends_at", ends_at)
    return items


@router.post("/{purchase_id}/items/{item_id}/rebuy", response_model=ItemRead)
def rebuy_item(
    purchase_id: str,
    item_id: str,
    response: Response,
    session: CurrentSession,
    list_and_user: MemberDep,
):
    """Put a settled purchase's line back onto the pending list.

    Re-buy takes one line of a past trip — a ListItem filed under it — and
    creates a fresh pending row carrying the product's identity, the quantity
    last bought, and the store it was bought at. The source line stays where
    it is: this reorders the product, it does not un-file the shop.

    An open cart is off limits. Its lines wear the green undo disc, and taking
    one back onto the list is undo territory, not re-buy — so a line still in
    the open trip is refused with a nudge to undo instead. A trip that closed
    earlier today is already closed, so is_open is False and the re-buy goes
    through; that is the same-day ficha exception, falling out of the open
    rule rather than needing a rule of its own.

    Idempotent against the add-item duplicate guard: if the product is already
    on the pending list (same trimmed-lower name, or same ean), that existing
    row is returned with 200 rather than a second copy created. A genuine
    create answers 201.
    """
    lst, current_user = list_and_user
    trip = session.get(Purchase, purchase_id)
    if trip is None or trip.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")

    now = datetime.now(UTC).replace(tzinfo=None)
    if trips.is_open(trip, now):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That item is still in the open cart; undo it instead.",
        )

    line = session.exec(
        select(ListItem).where(ListItem.id == item_id, ListItem.purchase_id == trip.id)
    ).first()
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    store = line.price_store or trip.store
    stores = [store] if store and store.strip() else []

    # The same guard add_item enforces: a product already pending on the list
    # is not re-added. Returning that row keeps re-buy idempotent — tapping it
    # twice reorders the product once.
    conditions = [func.trim(func.lower(ListItem.name)) == line.name.strip().lower()]
    if line.ean is not None:
        conditions.append(ListItem.ean == line.ean)
    existing = session.exec(
        select(ListItem)
        .where(ListItem.list_id == lst.id, ListItem.purchased_at.is_(None))
        .where(or_(*conditions))
        .limit(1)
    ).first()
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return existing

    pending = ListItem(
        list_id=lst.id,
        added_by=current_user.id,
        name=line.name,
        brand=line.brand,
        ean=line.ean,
        stores=stores,
        quantity=line.purchased_quantity or line.quantity,
    )
    session.add(pending)
    if stores:
        ensure_stores(session, lst.id, stores)
    lst.updated_at = now
    session.add(lst)
    session.commit()
    session.refresh(pending)
    # A genuine create pushes, like add_item; the idempotent 200 path above
    # returns before here and never notifies (nothing changed).
    _notify_safely(session, lst, current_user, "added", pending.name)
    response.status_code = status.HTTP_201_CREATED
    return pending


def _reject_bad_amount(value: float | None, what: str) -> None:
    """Range and finiteness for one money field, in plain Python.

    Not a Pydantic constraint: any constraint able to reject NaN crashes
    FastAPI's own 422 handler when it echoes the rejected value back — see
    PurchaseCloseBody.total. Finiteness is worth more than a tidy error:
    Postgres stores NaN happily, and the items feed then fails to serialize
    for everyone on the list.
    """
    if value is None:
        return
    if not math.isfinite(value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{what} must be a finite number",
        )
    if value < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{what} must not be negative",
        )


def _reject_bad_price(price: float | None, price_per: str | None, where: str) -> None:
    """The rules ItemCreate states about a price, restated in plain Python.

    A close prices items, so it can break them the same way creating one
    can: an amount that is negative or not finite, or a unit with no amount
    to apply it to. One endpoint must not store what its neighbour refuses.
    Plain Python rather than a model validator, for the reason in
    _reject_bad_amount.
    """
    _reject_bad_amount(price, f"{where}.price")
    if price_per is not None and price is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{where}.price_per requires {where}.price",
        )


@router.post("/close", response_model=PurchaseRead)
def close_purchase(
    body: PurchaseCloseBody,
    session: CurrentSession,
    list_and_user: MemberDep,
    client_tz: ClientTimezone,
):
    """Declare what a shop was — claim lines out of a trip and file them.

    Claiming every item in the cart closes the trip in place; claiming fewer
    splits the selection onto its own ticket and leaves the rest in the
    cart. Absent a `date`, the ticket's dates derive from the claimed lines'
    purchased_at and the close instant. A `date` back-dates it to a stated
    day — its boundaries are mapped in the client timezone (ADR-012), the same
    mapping a manual purchase uses, so it sorts under the day it covered.

    A line may also carry a corrected name/brand (the adjust-product editor):
    applied to the claimed item alongside its price and quantity.

    No push fires here. Like the receipt apply, a close records a shop that
    already happened — nothing joins the list unpurchased, and the impulse
    buys it creates are born bought, the same shape that path creates
    silently.
    """
    lst, current_user = list_and_user
    # Every amount the request carries, checked before anything is written,
    # so a bad one cannot leave half a sheet applied.
    _reject_bad_amount(body.total, "total")
    for index, line in enumerate(body.lines):
        _reject_bad_price(line.price, line.price_per, f"lines[{index}]")
    for index, new in enumerate(body.new_items):
        _reject_bad_price(new.price, new.price_per, f"new_items[{index}]")

    now = datetime.now(UTC).replace(tzinfo=None)

    # A back-dated close maps its day to the trip's boundaries the same way a
    # manual purchase does; a future day has no shop to file, so it is refused.
    dating = None
    if body.date is not None:
        if body.date > datetime.now(UTC).astimezone(client_tz).date():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="A purchase cannot be dated in the future",
            )
        opened_at = (
            datetime.combine(body.date, time.min, tzinfo=client_tz)
            .astimezone(UTC)
            .replace(tzinfo=None)
        )
        tears_off_at = trips.tears_off_at_for(opened_at, client_tz)
        # closed_at is the reconciliation instant, but NEVER in the future.
        # A same-day close's tear-off is tonight's midnight (ahead of now), so
        # stamping closed_at there would leave the just-closed trip reading as
        # «still open» (is_open compares ends_at = closed_at ?? tears_off_at
        # against now). min() lands a same-day close at `now` and keeps a
        # back-dated one at its covered day's tear-off (already past), so it
        # still sorts under that day.
        closed_at = min(tears_off_at, now)
        dating = (opened_at, tears_off_at, closed_at)

    try:
        purchase = trips.close(
            session,
            lst.id,
            [line.item_id for line in body.lines],
            body.store,
            body.total,
            now,
            purchase_id=body.purchase_id,
            dating=dating,
        )
    except trips.NotInTheCart:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Some items are not in the trip being closed",
        ) from None
    except trips.NothingToClose:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="There is nothing to close",
        ) from None

    for line in body.lines:
        # From the identity map: close() already loaded the cart and proved
        # every claimed id is in it.
        item = session.get(ListItem, line.item_id)
        if line.price is not None:
            item.price = line.price
            item.price_per = line.price_per
            item.price_store = body.store
        else:
            # A dash on the sheet is an answer: bought, price unconfirmed.
            # Whatever figure the item carried described some earlier shop,
            # not this one.
            item.price = None
            item.price_per = None
            item.price_store = None
        if line.quantity is not None:
            item.purchased_quantity = line.quantity
        # A correction from the adjust-product editor (10d): overwrite only what
        # the caller actually sent, leaving the rest of the product as it was.
        if line.name is not None:
            item.name = line.name
        if line.brand is not None:
            item.brand = line.brand
        # updated_at deliberately untouched: pricing is not the fresh write
        # the un-purchase grace window exists for, and stamping it here
        # would reopen that window on the purchase being filed.
        session.add(item)

    for new in body.new_items:
        session.add(
            ListItem(
                list_id=lst.id,
                added_by=current_user.id,
                name=new.name,
                brand=new.brand,
                ean=new.ean,
                # No stores, unlike the receipt path: `stores` is a hint
                # about where to buy something, and this is already bought.
                stores=[],
                quantity=None,  # planned qty — nobody planned an impulse buy
                purchased_quantity=new.quantity,
                price=new.price,
                price_per=new.price_per,
                price_store=body.store if new.price is not None else None,
                purchased_at=now,
                purchase_id=purchase.id,
            )
        )

    ensure_stores(session, lst.id, [body.store])
    lst.updated_at = now
    session.add(lst)
    session.commit()
    session.refresh(purchase)
    return purchase


@router.post("/manual", response_model=PurchaseRead)
def create_manual_purchase(
    body: PurchaseManualBody,
    session: CurrentSession,
    list_and_user: MemberDep,
    client_tz: ClientTimezone,
):
    """Write down a shop by hand — a trip born closed, holding no lines.

    Unlike a close, this claims nothing from the cart: it records that a shop
    happened on a stated calendar day, optionally where and for how much. The
    day is mapped to the trip's boundaries in the request's client timezone
    (ADR-012), so a back-dated entry files under the day it covered rather than
    under now.
    """
    lst, _ = list_and_user
    _reject_bad_amount(body.total, "total")

    # This feature back-dates a shop that already happened. A future date has no
    # such shop, and because the trip's boundary is date-derived, a future one
    # would carry a coalesce(closed_at, tears_off_at) key ahead of now and sort
    # ABOVE the live cart in history. Reject it rather than file that.
    today = datetime.now(UTC).astimezone(client_tz).date()
    if body.date > today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A manual purchase cannot be dated in the future",
        )

    # An empty store is not a store: coerce blank to None so a bare record reads
    # back the same whether the caller omitted store or sent "". ensure_stores
    # already skips blanks; this keeps the Purchase.store column consistent too.
    store = body.store if (body.store and body.store.strip()) else None

    # The local midnight that STARTS the submitted day, as naive UTC — the same
    # shape tears_off_at_for produces, but for the day's opening rather than its
    # close.
    opened_at = (
        datetime.combine(body.date, time.min, tzinfo=client_tz).astimezone(UTC).replace(tzinfo=None)
    )
    tears_off_at = trips.tears_off_at_for(opened_at, client_tz)

    # closed_at is set to the tear-off, not now, deliberately: the history stack
    # sorts by coalesce(closed_at, tears_off_at), so a back-dated entry must
    # carry a date-derived boundary or it would sort under "now" instead of the
    # day it covered. A future reader should NOT "fix" this to now. Being
    # non-null also exempts the row from uq_purchases_open_per_list, so it never
    # collides with the open cart or another closed trip sharing a tears_off_at.
    now = datetime.now(UTC).replace(tzinfo=None)
    purchase = Purchase(
        list_id=lst.id,
        opened_at=opened_at,
        tears_off_at=tears_off_at,
        closed_at=tears_off_at,
        store=store,
        total=body.total,
    )
    session.add(purchase)
    if store is not None:
        ensure_stores(session, lst.id, [store])
    lst.updated_at = now
    session.add(lst)
    session.commit()
    session.refresh(purchase)
    return purchase
