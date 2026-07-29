import math
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status

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

    Takes a subset of the cart, so an evening with two shops in it becomes two
    tickets rather than one confused one.
    """
    lst, _ = list_and_user
    # PurchaseClose.total is deliberately unconstrained at the schema level --
    # see its docstring for why a Pydantic constraint (ge=0, allow_inf_nan,
    # anything) that can reject NaN specifically crashes FastAPI's own
    # validation-error handler. Both checks that constraint would have made
    # live here instead, in plain Python, so a rejection never round-trips
    # the bad value through Pydantic's error path.
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
    try:
        purchase = trips.close(session, lst.id, body.item_ids, body.store, body.total)
    except trips.NotInTheCart:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Some items are not in the open trip",
        ) from None
    except trips.NothingToClose:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="There is nothing in the cart to close",
        ) from None
    lst.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(lst)
    session.commit()
    session.refresh(purchase)
    return purchase
