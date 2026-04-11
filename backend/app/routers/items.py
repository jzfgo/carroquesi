from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import case, nulls_last
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
        if item.purchased_at is not None:
            today = datetime.now(timezone.utc).date()
            if item.purchased_at.date() != today:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot unpurchase an item purchased on a previous day",
                )
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
