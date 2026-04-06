from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, select

from app.db.models import List, ListItem
from app.dependencies import CurrentSession, MemberDep
from app.schemas.items import ItemCreate, ItemRead, ItemUpdate

router = APIRouter(prefix="/lists/{list_id}/items", tags=["items"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(lst)


@router.get("", response_model=list[ItemRead])
def get_items(
    list_id: str,
    list_and_user: MemberDep,
    session: CurrentSession,
    sort: str | None = None,
):
    lst, _ = list_and_user
    query = select(ListItem).where(ListItem.list_id == lst.id)
    if sort == "name":
        query = query.order_by(ListItem.name)
    elif sort == "brand":
        query = query.order_by(ListItem.brand)
    return session.exec(query).all()


@router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
def add_item(
    body: ItemCreate,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, current_user = list_and_user
    item = ListItem(list_id=lst.id, added_by=current_user.id, **body.model_dump())
    session.add(item)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
    return item


@router.patch("/{item_id}", response_model=ItemRead)
def update_item(
    item_id: str,
    body: ItemUpdate,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    item = session.get(ListItem, item_id)
    if item is None or item.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    data = body.model_dump(exclude_unset=True)
    purchased = data.pop('purchased', None)
    for field, value in data.items():
        setattr(item, field, value)
    if purchased is True and item.purchased_at is None:
        item.purchased_at = datetime.now(timezone.utc).replace(tzinfo=None)
    elif purchased is False:
        item.purchased_at = None
    item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(item)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
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
