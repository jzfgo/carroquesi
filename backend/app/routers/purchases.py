import math
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status

from app.db.models import ListItem, Purchase
from app.dependencies import CurrentSession, MemberDep
from app.schemas.purchases import PurchaseClose, PurchaseRead
from app.services import trips

router = APIRouter(prefix="/lists/{list_id}/purchases", tags=["purchases"])


@router.post("/close", response_model=PurchaseRead)
def close_purchase(
    list_id: str,
    body: PurchaseClose,
    session: CurrentSession,
    list_and_user: MemberDep,
):
    """Declare what a shop was — "Cerrar compra".

    One press of the sheet's primary is one call: the lines it ticked, the
    products it invented, the shop and the date. Doing it in one write is what
    lets the whole act sit in the offline queue as a single entry.
    """
    lst, current_user = list_and_user
    # See PurchaseClose.total's docstring for why this is checked here in
    # plain Python rather than as a Pydantic constraint.
    if body.total is not None:
        if not math.isfinite(body.total):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="total must be a finite number",
            )
        if body.total < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="total must not be negative",
            )

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
    # A purchase_id that resolves to nothing leaves the anchor at now. The
    # refusal for that belongs to close(), which already makes it, and one
    # place should decide it.
    anchor = now
    if body.purchase_id is not None:
        named = session.get(Purchase, body.purchase_id)
        if named is not None:
            anchor = named.opened_at

    filed: list[str] = []

    for new in body.new_items:
        created = ListItem(
            list_id=list_id,
            added_by=current_user.id,
            name=new.name,
            brand=new.brand,
            ean=new.ean,
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
        filed.append(created.id)

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
        filed.append(item.id)

    session.flush()

    try:
        purchase = trips.close(
            session,
            lst.id,
            # Naming no line means "close the whole cart" — the ordinary
            # one-shop evening, and what every caller sent before the sheet
            # existed. The 409 below then means the cart was empty.
            filed or None,
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
