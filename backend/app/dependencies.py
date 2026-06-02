from typing import Annotated, Any, Optional, TypeAlias

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.core.config import settings
from app.core.firebase import verify_id_token
from app.db.models import List, ListMember, User
from app.db.session import get_session

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
    x_dev_user_id: Annotated[Optional[str], Header()] = None,
    x_dev_is_admin: Annotated[Optional[str], Header()] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> User:
    if settings.dev_auth_bypass and x_dev_user_id:
        user = session.exec(select(User).where(User.firebase_uid == x_dev_user_id)).first()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Dev bypass: no user with firebase_uid={x_dev_user_id!r}",
            )
        object.__setattr__(user, "is_admin", x_dev_is_admin == "true")
        return user

    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

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
    object.__setattr__(user, "is_admin", decoded.get("is_admin", False))
    return user


# ---------------------------------------------------------------------------
# Annotated dependency aliases (recommended FastAPI pattern)
# Import these in routers instead of repeating Depends(...) at every endpoint.
# ---------------------------------------------------------------------------
CurrentUser: TypeAlias = Annotated[User, Depends(get_current_user)]
CurrentSession: TypeAlias = Annotated[Session, Depends(get_session)]


def require_member(
    list_id: str,
    current_user: CurrentUser,
    session: CurrentSession,
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
    current_user: CurrentUser,
    session: CurrentSession,
) -> tuple[List, User]:
    lst = session.get(List, list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    if lst.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the owner")
    return lst, current_user


MemberDep: TypeAlias = Annotated[tuple[List, User], Depends(require_member)]
OwnerDep: TypeAlias = Annotated[tuple[List, User], Depends(require_owner)]


def require_admin(current_user: CurrentUser) -> User:
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return current_user


AdminUser: TypeAlias = Annotated[User, Depends(require_admin)]
