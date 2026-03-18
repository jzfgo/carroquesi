from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.core.firebase import verify_id_token
from app.db.models import List, ListMember, User
from app.db.session import get_session

bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    session: Session = Depends(get_session),
) -> User:
    try:
        decoded: dict[str, Any] = verify_id_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = session.exec(select(User).where(User.firebase_uid == decoded["uid"])).first()
    if user is None:
        # First login — create the user record
        user = User(
            firebase_uid=decoded["uid"],
            email=decoded.get("email", ""),
            display_name=decoded.get("name"),
            photo_url=decoded.get("picture"),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


def require_member(
    list_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> tuple[List, User]:
    lst = session.get(List, list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    membership = session.exec(
        select(ListMember).where(
            ListMember.list_id == list_id, ListMember.user_id == current_user.id
        )
    ).first()
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    return lst, current_user


def require_owner(
    list_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> tuple[List, User]:
    lst = session.get(List, list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    if lst.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the owner")
    return lst, current_user
