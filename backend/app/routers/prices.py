from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import Session, or_, select

from app.db.models import ListItem, ListMember, Purchase
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.prices import PriceCreate, PriceEntry, PriceHistoryResponse
from app.services import trips
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
    if item.purchase_id is not None:
        trip = session.get(Purchase, item.purchase_id)
        if trip is not None and not trips.is_open(trip):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Cannot delete the price of a purchase that has already been filed",
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
    scope: Annotated[str, Query(pattern="^(this_list|my_lists)$")] = "this_list",
):
    item = _get_item_or_404(session, item_id, list_id)
    items = _query_by_scope(session, item, scope, current_user.id)
    trip_stores = _trip_stores(session, items)
    entries = [
        PriceEntry(
            amount=i.price,
            price_per=i.price_per,
            store=i.price_store or trip_stores.get(i.purchase_id or ""),
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


def _trip_stores(session: Session, items: list[ListItem]) -> dict[str, str | None]:
    """The shop each trip named, for the rows that do not carry one themselves.

    `price_store` is only ever written next to a price, so a shop that recorded
    no amount has none. The trip it belongs to still knows where it happened,
    and that is the same answer — so the history files the row under the shop
    instead of stranding it under "no shop". A trip filed by midnight rather
    than by a person names none either, and those stay unplaced.
    """
    wanted = {i.purchase_id for i in items if i.price_store is None and i.purchase_id}
    if not wanted:
        return {}
    trips = session.exec(select(Purchase).where(Purchase.id.in_(wanted))).all()
    return {t.id: t.store for t in trips}


def _query_by_scope(session, item: ListItem, scope: str, user_id: str) -> list[ListItem]:
    base = _base_conditions(item)

    if scope == "this_list":
        return session.exec(select(ListItem).where(ListItem.list_id == item.list_id, *base)).all()

    # scope == "my_lists". There was a third, "all", which searched every list
    # in the database — so it answered with the shop, the date and the quantity
    # of strangers' purchases, not only their prices. Nothing ever called it,
    # and the app already has a community price that is built the other way
    # round: get_community_price reads aggregated third-party data, not the
    # rows of the household next door. Removed while it was still free to
    # remove; the reasons to keep a dormant one are never as good later.
    my_list_ids = session.exec(
        select(ListMember.list_id).where(ListMember.user_id == user_id)
    ).all()
    return session.exec(select(ListItem).where(ListItem.list_id.in_(my_list_ids), *base)).all()


def _base_conditions(item: ListItem):
    # A shop that recorded no amount still belongs in the history: the history
    # says what was paid and when, and "nothing was written down" is part of
    # that answer. Unbought items with no price say nothing and stay out.
    is_a_record = or_(ListItem.price.isnot(None), ListItem.purchased_at.isnot(None))
    if item.ean:
        return (ListItem.ean == item.ean, is_a_record)
    return (ListItem.name == item.name, ListItem.brand == item.brand, is_a_record)
