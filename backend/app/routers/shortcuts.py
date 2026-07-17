from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response, status
from sqlmodel import select

from app.db.models import ApiKey
from app.dependencies import CurrentSession, CurrentUser
from app.services.api_keys import generate_key, hash_key

router = APIRouter(tags=["shortcuts"])

_SHORTCUT_PATH = Path(__file__).resolve().parent.parent / "static" / "cqs.shortcut"


@router.get("/shortcuts/cqs.shortcut")
def download_shortcut() -> Response:
    if not _SHORTCUT_PATH.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shortcut not available")
    return Response(
        content=_SHORTCUT_PATH.read_bytes(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="CarroQueSi.shortcut"'},
    )


@router.post("/account/api-key")
def issue_api_key(current_user: CurrentUser, session: CurrentSession) -> dict:
    """Issue an API key only if the user doesn't already have one — never rotates.

    First-time issuance and regeneration are deliberately separate: this endpoint is
    idempotent so the "Añadir atajo a Siri" flow can't silently invalidate a key the
    user already pasted into their Shortcut (which would happen if the client's
    has_api_key state were stale or its /users/me load had failed). Rotation is only
    ever triggered by the explicit /account/api-key/regenerate call. When a key
    already exists we return key=None, since the stored hash can't be reversed to
    re-display the plaintext.
    """
    existing = session.exec(select(ApiKey).where(ApiKey.user_id == current_user.id)).first()
    if existing is not None:
        return {"key": None, "created": False}
    plaintext = generate_key()
    session.add(ApiKey(user_id=current_user.id, key_hash=hash_key(plaintext)))
    session.commit()
    return {"key": plaintext, "created": True}


@router.post("/account/api-key/regenerate")
def regenerate_api_key(current_user: CurrentUser, session: CurrentSession) -> dict:
    plaintext = generate_key()
    api_key = session.exec(select(ApiKey).where(ApiKey.user_id == current_user.id)).first()
    if api_key is None:
        api_key = ApiKey(user_id=current_user.id, key_hash="")
    api_key.key_hash = hash_key(plaintext)
    api_key.last_used_at = None
    session.add(api_key)
    session.commit()
    return {
        "key": plaintext,
        "regenerated_at": datetime.now(UTC).replace(tzinfo=None).isoformat(),
    }
