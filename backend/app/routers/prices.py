from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import Session, select

from app.db.models import ListItem, ListMember
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.prices import PriceCreate, PriceEntry, PriceHistoryResponse
from app.services.community_price import get_community_price

router = APIRouter(prefix="/lists/{list_id}/items/{item_id}/prices", tags=["prices"])


def _get_item_or_404(session: Session, item_id: str, list_id: str) -> ListItem:
    item = session.exec(
        select(ListItem).where(ListItem.id == item_id, ListItem.list_id == list_id)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


def _write_price(item: ListItem, price_in: PriceCreate, session: Session) -> PriceEntry:
    item.price = price_in.amount
    item.price_per = price_in.price_per
    item.price_store = price_in.store
    session.add(item)
    session.commit()
    session.refresh(item)
    return PriceEntry(amount=item.price, price_per=item.price_per, store=item.price_store)


@router.post("", response_model=PriceEntry, status_code=status.HTTP_201_CREATED)
def create_price(
    list_id: str,
    item_id: str,
    price_in: PriceCreate,
    session: CurrentSession,
    current_user: CurrentUser,
    _: MemberDep,
):
    item = _get_item_or_404(session, item_id, list_id)
    if item.price is not None:
        raise HTTPException(
            status_code=409, detail="Item already has a price; use PATCH to update it"
        )
    return _write_price(item, price_in, session)


@router.patch("", response_model=PriceEntry)
def update_price(
    list_id: str,
    item_id: str,
    price_in: PriceCreate,
    session: CurrentSession,
    current_user: CurrentUser,
    _: MemberDep,
):
    item = _get_item_or_404(session, item_id, list_id)
    if item.price is None:
        raise HTTPException(status_code=404, detail="Item has no price yet; use POST to set it")
    return _write_price(item, price_in, session)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_price(
    list_id: str,
    item_id: str,
    session: CurrentSession,
    current_user: CurrentUser,
    _: MemberDep,
):
    item = _get_item_or_404(session, item_id, list_id)
    if item.price is None:
        raise HTTPException(status_code=404, detail="Item has no price to delete")
    if item.purchased_at is not None:
        today = datetime.now(UTC).date()
        if item.purchased_at.date() != today:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot delete the price of an item purchased on a previous day",
            )
    item.price = None
    item.price_per = None
    item.price_store = None
    session.add(item)
    session.commit()


@router.get("", response_model=PriceHistoryResponse)
def get_price_history(
    list_id: str,
    item_id: str,
    session: CurrentSession,
    current_user: CurrentUser,
    _: MemberDep,
    scope: Annotated[str, Query(pattern="^(this_list|my_lists|all)$")] = "this_list",
):
    item = _get_item_or_404(session, item_id, list_id)
    items = _query_by_scope(session, item, scope, current_user.id)
    entries = [
        PriceEntry(
            amount=i.price,
            price_per=i.price_per,
            store=i.price_store,
            purchased_at=i.purchased_at.isoformat() if i.purchased_at else None,
            quantity=i.quantity,
        )
        for i in items
    ]
    community_price, community_price_per = (
        get_community_price(item.ean, session) if item.ean else (None, None)
    )
    return PriceHistoryResponse(
        entries=entries,
        community_price=community_price,
        community_price_per=community_price_per,
    )


def _query_by_scope(session, item: ListItem, scope: str, user_id: str) -> list[ListItem]:
    base = _base_conditions(item)

    if scope == "this_list":
        return list(
            session.exec(select(ListItem).where(ListItem.list_id == item.list_id, *base)).all()
        )

    if scope == "my_lists":
        my_list_ids = list(
            session.exec(select(ListMember.list_id).where(ListMember.user_id == user_id)).all()
        )
        return list(
            session.exec(select(ListItem).where(ListItem.list_id.in_(my_list_ids), *base)).all()
        )

    # scope == "all"
    return list(session.exec(select(ListItem).where(*base)).all())


def _base_conditions(item: ListItem):
    has_price = ListItem.price.isnot(None)
    if item.ean:
        return (ListItem.ean == item.ean, has_price)
    return (ListItem.name == item.name, ListItem.brand == item.brand, has_price)
