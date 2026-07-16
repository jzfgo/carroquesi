from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response, status
from sqlmodel import Session, select

from app.core.config import settings
from app.db.models import ApiKey, List, ListMember
from app.dependencies import CurrentSession, CurrentUser
from app.services.api_keys import decrypt_key, encrypt_key, generate_key, hash_key
from app.services.shortcut_plist import build_shortcut_plist

router = APIRouter(tags=["shortcuts"])


def _get_or_create_api_key(user_id: str, session: Session) -> ApiKey:
    api_key = session.exec(select(ApiKey).where(ApiKey.user_id == user_id)).first()
    if api_key is not None:
        return api_key
    plaintext = generate_key()
    api_key = ApiKey(
        user_id=user_id,
        key_hash=hash_key(plaintext),
        key_ciphertext=encrypt_key(plaintext),
    )
    session.add(api_key)
    session.commit()
    session.refresh(api_key)
    return api_key


@router.get("/shortcuts/cqs.shortcut")
def download_shortcut(current_user: CurrentUser, session: CurrentSession) -> Response:
    default_list = session.exec(
        select(List)
        .join(ListMember, ListMember.list_id == List.id)
        .where(ListMember.user_id == current_user.id)
        .order_by(List.updated_at.desc())
    ).first()
    if default_list is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Create or join a list before setting up Siri",
        )

    api_key = _get_or_create_api_key(current_user.id, session)
    plaintext = decrypt_key(api_key.key_ciphertext)

    plist_bytes = build_shortcut_plist(
        api_base=settings.api_base_url,
        api_key=plaintext,
        default_list_id=default_list.id,
    )
    return Response(
        content=plist_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="CarroQueSi.shortcut"'},
    )


@router.post("/account/api-key/regenerate")
def regenerate_api_key(current_user: CurrentUser, session: CurrentSession) -> dict:
    plaintext = generate_key()
    api_key = session.exec(select(ApiKey).where(ApiKey.user_id == current_user.id)).first()
    if api_key is None:
        api_key = ApiKey(user_id=current_user.id, key_hash="", key_ciphertext="")
    api_key.key_hash = hash_key(plaintext)
    api_key.key_ciphertext = encrypt_key(plaintext)
    api_key.last_used_at = None
    session.add(api_key)
    session.commit()
    session.refresh(api_key)
    return {"regenerated_at": datetime.now(UTC).replace(tzinfo=None).isoformat()}
