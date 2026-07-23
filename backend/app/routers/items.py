import logging
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import case, func, nulls_last, or_
from sqlmodel import Session, select

from app.db.models import List, ListItem, User
from app.dependencies import CurrentSession, MemberDep, MemberOrDefaultDep
from app.schemas.items import ItemCreate, ItemRead, ItemUpdate
from app.services.push import notify_list_change

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lists/{list_id}/items", tags=["items"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(lst)


def _notify_safely(session: Session, lst: List, actor: User, event: str, name: str) -> None:
    """Push is best-effort. A notification failure must never fail a list write."""
    try:
        notify_list_change(session, lst, actor, event, name)
    except Exception:  # pragma: no cover - notify_list_change already swallows
        logger.exception("push notification failed for list %s", lst.id)


@router.get("", response_model=list[ItemRead])
def get_items(
    list_id: str,
    list_and_user: MemberOrDefaultDep,
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
    list_and_user: MemberOrDefaultDep,
    session: CurrentSession,
):
    lst, current_user = list_and_user
    conditions = [func.trim(func.lower(ListItem.name)) == body.name.strip().lower()]
    if body.ean is not None:
        conditions.append(ListItem.ean == body.ean)
    duplicate = session.exec(
        select(ListItem)
        .where(ListItem.list_id == lst.id, ListItem.purchased_at.is_(None))
        .where(or_(*conditions))
        .limit(1)
    ).first()
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Item already in list")
    item = ListItem(list_id=lst.id, added_by=current_user.id, **body.model_dump())
    session.add(item)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
    _notify_safely(session, lst, current_user, "added", item.name)
    return item


@router.patch("/{item_id}", response_model=ItemRead)
def update_item(
    item_id: str,
    body: ItemUpdate,
    list_and_user: MemberOrDefaultDep,
    session: CurrentSession,
):
    lst, current_user = list_and_user
    item = session.get(ListItem, item_id)
    if item is None or item.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    was_purchased = item.purchased_at is not None
    data = body.model_dump(exclude_unset=True)
    purchased = data.pop("purchased", None)
    for field, value in data.items():
        setattr(item, field, value)
    if purchased is True and item.purchased_at is None:
        item.purchased_at = datetime.now(UTC).replace(tzinfo=None)
        item.purchased_by = current_user.id
    elif purchased is False:
        if item.purchased_at is not None:
            today = datetime.now(UTC).date()
            if item.purchased_at.date() != today:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot unpurchase an item purchased on a previous day",
                )
        item.purchased_at = None
    item.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(item)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
    # Only NULL -> set notifies. Un-purchasing is a correction, and corrections
    # should not buzz every member's phone.
    if not was_purchased and item.purchased_at is not None:
        _notify_safely(session, lst, current_user, "purchased", item.name)
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
