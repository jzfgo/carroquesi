import math
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.db.models import ListItem, Purchase
from app.dependencies import CurrentSession, MemberDep
from app.schemas.purchases import PurchaseClose, PurchaseRead
from app.services import trips

router = APIRouter(prefix="/lists/{list_id}/purchases", tags=["purchases"])


def _reject_bad_amount(value: float | None, what: str) -> None:
    """Range and finiteness for one money field, in plain Python.

    Not a Pydantic constraint. Any constraint able to reject NaN crashes
    FastAPI's own 422 handler when it echoes the rejected value back — see
    PurchaseClose.total's comment for the detail. Finiteness is worth more
    than a tidy error: Postgres stores NaN happily, and the items feed then
    fails to serialize for everyone on the list.
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
    """The two rules ItemCreate states about a price, restated in plain Python.

    A close sheet prices items, so it can break them the same way creating an
    item can: an amount that is negative or not finite, or a unit with no
    amount to apply it to. One endpoint should not store what its neighbour
    refuses. Plain Python rather than the model validator ItemCreate uses,
    for the reason in _reject_bad_amount.
    """
    _reject_bad_amount(price, f"{where}.price")
    if price_per is not None and price is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{where}.price_per requires {where}.price",
        )


@router.post("/close", response_model=PurchaseRead)
def close_purchase(
    list_id: str,
    body: PurchaseClose,
    session: CurrentSession,
    list_and_user: MemberDep,
):
    """Declare what a shop was — "Cerrar compra".

    One press of the button is one call: the lines it ticked, the things
    bought that were never on the list, the shop and the date. Doing it in one
    write is what lets the whole act sit in the offline queue as a single
    entry.
    """
    lst, current_user = list_and_user
    # Every amount the request carries, checked before anything is written, so
    # a bad one cannot leave half a sheet applied.
    _reject_bad_amount(body.total, "total")
    for index, line in enumerate(body.lines):
        _reject_bad_price(line.price, line.price_per, f"lines[{index}]")
    for index, new in enumerate(body.new_items):
        _reject_bad_price(new.price, new.price_per, f"new_items[{index}]")

    now = datetime.now(UTC).replace(tzinfo=None)
    # Same clamp a tap gets: no future, and no older than the backdate limit.
    # A hand-set date carries a live clock's risks, unlike a receipt's.
    purchase_ts = trips.tap_time(body.purchased_at, now)

    # The date on the sheet says *when* the shop happened. The trip says
    # *which* shop it was. They disagree whenever someone writes down an old
    # trip, or backdates today's one, and then the trip has to win: an item
    # attached by its own date would land in a trip this call is not closing,
    # and close() would reject it as not in the cart.
    #
    # This is the deliberate exception to the receipt path's rule that one
    # instant must serve both purchased_at and attach. That rule is about the
    # case where nothing names a trip: the timestamp is then the only thing
    # that can pick one, so the two must agree. Here the caller names the trip
    # outright, which is better evidence than a date.
    #
    # Anchoring on opened_at works because trip_for resolves a trip by the
    # local day of the instant it is handed, and tears_off_at_for(opened_at)
    # still equals a trip's own tears_off_at.
    #
    # close() is what could break that equality: it recomputes opened_at from
    # the items it files, and its split branch recomputes it on the trip that
    # *stays open* too. So the open trip this can resolve is one whose
    # opened_at close() has already moved. What keeps it honest is narrower
    # than "closed trips are refused": every item whose purchased_at this
    # endpoint moves is also named in the close, so it leaves the trip rather
    # than remaining in it, and the remaining items were stamped by paths that
    # use one instant for both purchased_at and attach. The recomputed
    # opened_at therefore still falls on the trip's own day.
    #
    # Written down because nothing tests it, and the fragile step is that
    # last one: a future caller that stamps purchased_at without filing the
    # item leaves it behind with a date from another day, and attach then
    # resolves the wrong trip in silence.
    #
    # A purchase_id nobody can resolve leaves the anchor at now, and one that
    # names another list's trip anchors on that trip's day. Neither is checked
    # here. The refusal for both belongs to close(), which already makes it,
    # and one place should decide it. Whatever those paths wrote never lands:
    # the request raises before session.commit(), and the session dependency
    # closes without committing.
    anchor = now
    if body.purchase_id is not None:
        named = session.get(Purchase, body.purchase_id)
        if named is not None:
            anchor = named.opened_at

    # Every id this call wrote to. Not "filed": a line that was already bought
    # and only got a new price is in here too, and nothing about its trip
    # moved. "Filed" means a closed trip everywhere else in this call graph.
    touched: list[str] = []

    for new in body.new_items:
        created = ListItem(
            list_id=list_id,
            added_by=current_user.id,
            name=new.name,
            brand=new.brand,
            ean=new.ean,
            # No stores, unlike the receipt path. `stores` is a hint about
            # where to buy something, and this was already bought.
            stores=[],
            quantity=None,  # planned qty — nobody planned an impulse buy
            purchased_quantity=new.quantity,
            price=new.price,
            price_per=new.price_per,
            price_store=body.store if new.price is not None else None,
            purchased_at=purchase_ts,
        )
        session.add(created)
        session.flush()
        try:
            trips.attach(session, created, anchor)
        except trips.AlreadyFiled:
            # Unreachable — a fresh row has no purchase_id — but attach() is a
            # shared entry point and every caller must answer for what it can
            # raise, or the defensive branch becomes a 500 in waiting.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot add to a trip that has already been filed",
            ) from None
        touched.append(created.id)

    for line in body.lines:
        item = session.get(ListItem, line.item_id)
        if item is None or item.list_id != list_id:
            continue
        # The transition is read from server state, never from a client flag,
        # so one member's stale sheet cannot rewrite a timestamp another
        # member already set. Same rule the receipt endpoint follows.
        if item.purchased_at is None:
            item.purchased_at = purchase_ts
            try:
                trips.attach(session, item, anchor)
            except trips.AlreadyFiled:
                # Also unreachable today, for a different reason than the one
                # above: getting here needs an item whose purchased_at is NULL
                # while its trip is closed, and those two are always cleared
                # together — un-purchasing detaches first, and is refused
                # outright once the trip has ended. Answered anyway, because
                # that invariant is kept in another router and nothing binds
                # the two.
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot add to a trip that has already been filed",
                ) from None
        if line.price is not None:
            item.price = line.price
            item.price_per = line.price_per
            item.price_store = body.store
        if line.quantity is not None:
            item.purchased_quantity = line.quantity
        session.add(item)
        touched.append(item.id)

    session.flush()

    # Whether the sheet named anything, which is not whether anything of it
    # survived. A sheet naming only rows that have since been deleted must not
    # fall through to "close the whole cart": the household ticked one thing
    # and the server would file everything, under a total that covers none of
    # it. An empty selection reaches close() and comes back as a refusal,
    # which is an error the offline queue can retry or drop.
    named_anything = bool(body.lines or body.new_items)

    try:
        purchase = trips.close(
            session,
            list_id,
            # Naming nothing at all means "close the whole cart" — the
            # ordinary one-shop evening, and what every caller sent before the
            # sheet existed.
            touched if named_anything else None,
            body.store,
            body.total,
            now,
            purchase_id=body.purchase_id,
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

    lst.updated_at = now
    session.add(lst)
    session.commit()
    session.refresh(purchase)
    return purchase


@router.get("", response_model=list[PurchaseRead])
def list_purchases(
    session: CurrentSession,
    list_and_user: MemberDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """The trips a list's receipt headers need.

    Separate from the items payload on purpose: a trip's store and total
    belong to one ticket, and riding them along on every item would repeat
    one shop's figures across all of its lines.
    """
    lst, _ = list_and_user
    stmt = (
        select(Purchase)
        .where(Purchase.list_id == lst.id)
        # The id breaks ties. Two trips written down for the same past date
        # get the same opened_at, and without a second key the database may
        # return them in either order. The order the id gives is arbitrary,
        # but it is the same on every poll, so the headers do not reshuffle
        # under the reader.
        .order_by(Purchase.opened_at.desc(), Purchase.id.desc())
        .limit(limit)
    )
    return list(session.exec(stmt).all())
