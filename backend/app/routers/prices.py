from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.db.models import ListItem, ListMember
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.prices import PriceCreate, PriceEntry, PriceHistoryResponse

router = APIRouter(prefix="/lists/{list_id}/items/{item_id}/prices", tags=["prices"])


def _get_item_or_404(session, item_id: str, list_id: str) -> ListItem:
    item = session.exec(
        select(ListItem).where(ListItem.id == item_id, ListItem.list_id == list_id)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


def _write_price(item: ListItem, price_in: PriceCreate, session) -> PriceEntry:
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
        raise HTTPException(status_code=409, detail="Item already has a price; use PATCH to update it")
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


@router.get("", response_model=PriceHistoryResponse)
def get_price_history(
    list_id: str,
    item_id: str,
    scope: str = Query(default="this_list", pattern="^(this_list|my_lists|all)$"),
    session: CurrentSession = None,
    current_user: CurrentUser = None,
    _: MemberDep = None,
):
    item = _get_item_or_404(session, item_id, list_id)
    items = _query_by_scope(session, item, scope, current_user.id)
    entries = [PriceEntry(amount=i.price, price_per=i.price_per, store=i.price_store) for i in items]
    return PriceHistoryResponse(entries=entries)


def _query_by_scope(session, item: ListItem, scope: str, user_id: str) -> list[ListItem]:
    base = _base_conditions(item)

    if scope == "this_list":
        return list(session.exec(
            select(ListItem).where(ListItem.list_id == item.list_id, *base)
        ).all())

    if scope == "my_lists":
        my_list_ids = list(session.exec(
            select(ListMember.list_id).where(ListMember.user_id == user_id)
        ).all())
        return list(session.exec(
            select(ListItem).where(ListItem.list_id.in_(my_list_ids), *base)
        ).all())

    # scope == "all"
    return list(session.exec(select(ListItem).where(*base)).all())


def _base_conditions(item: ListItem):
    has_price = ListItem.price.isnot(None)
    if item.ean:
        return (ListItem.ean == item.ean, has_price)
    return (ListItem.name == item.name, ListItem.brand == item.brand, has_price)
