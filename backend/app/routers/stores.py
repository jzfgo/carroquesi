from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.db.models import ListStore
from app.dependencies import CurrentSession, MemberDep
from app.schemas.stores import StoreRead, StoreRename

router = APIRouter(prefix="/lists/{list_id}/stores", tags=["stores"])


@router.get("", response_model=list[StoreRead])
def get_stores(
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    rows = session.exec(
        select(ListStore).where(ListStore.list_id == lst.id).order_by(ListStore.display_name)
    ).all()
    return rows


@router.patch("/{store_key}", response_model=StoreRead)
def rename_store(
    store_key: str,
    body: StoreRename,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    row = session.exec(
        select(ListStore).where(ListStore.list_id == lst.id, ListStore.store_key == store_key)
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
    now = datetime.now(UTC).replace(tzinfo=None)
    row.display_name = body.display_name.strip()
    row.updated_at = now
    session.add(row)
    # Other members' open lists must repaint with the new label; the poll
    # watches lists.updated_at.
    lst.updated_at = now
    session.add(lst)
    session.commit()
    session.refresh(row)
    return row
