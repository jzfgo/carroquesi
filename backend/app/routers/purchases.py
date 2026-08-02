import math
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status

from app.db.models import ListItem
from app.dependencies import CurrentSession, MemberDep
from app.schemas.purchases import PurchaseCloseBody, PurchaseRead
from app.services import trips
from app.services.store_registry import ensure_stores

router = APIRouter(prefix="/lists/{list_id}/purchases", tags=["purchases"])


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
):
    """Declare what a shop was — claim lines out of a trip and file them.

    Claiming every item in the cart closes the trip in place; claiming fewer
    splits the selection onto its own ticket and leaves the rest in the
    cart. There is no date control: the ticket's dates derive from the
    claimed lines' purchased_at and the close instant, which covers every
    shop the current write paths can produce.

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
    try:
        purchase = trips.close(
            session,
            lst.id,
            [line.item_id for line in body.lines],
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
