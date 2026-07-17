from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response, status
from sqlmodel import select

from app.db.models import ApiKey
from app.dependencies import CurrentSession, CurrentUser
from app.services.api_keys import generate_key, hash_key
from app.services.default_list import has_default

router = APIRouter(tags=["shortcuts"])

_SHORTCUT_PATH = Path(__file__).resolve().parent.parent / "static" / "cqs.shortcut"


@router.get("/shortcuts/cqs.shortcut")
def download_shortcut() -> Response:
    if not _SHORTCUT_PATH.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shortcut not available")
    # The imported shortcut takes its name — and thus its Siri trigger phrase — from
    # this download filename. "Carro Que Sí" (spaced, natural Spanish) is far easier
    # for Siri to recognise than the single token "CarroQueSi". The accented, spaced
    # form goes in the RFC 6266 `filename*` (UTF-8); an ASCII `filename` is kept as a
    # fallback for clients that don't parse the extended parameter.
    return Response(
        content=_SHORTCUT_PATH.read_bytes(),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": (
                'attachment; filename="Carro Que Si.shortcut"; '
                "filename*=UTF-8''Carro%20Que%20S%C3%AD.shortcut"
            )
        },
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

    Gated on the user having a default list: the shortcut sends list_id="default",
    which only resolves for a user with an explicit default. Setting Siri up without
    one would just produce a shortcut that 404s, so we block the flow here (detail
    "no_default_list") and the client nudges the user to mark a list as default first.
    """
    if not has_default(session, current_user.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="no_default_list")
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
