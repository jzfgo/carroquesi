"""Opting out of the monthly report, by a link that needs no login.

The link carries a signed token naming the user and the list. The token
never expires: an unsubscribe link must keep working in an old email.
It can only stop a report, so a leaked link can do no worse than that.
"""

import base64
import hashlib
import hmac

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.config import get_settings
from app.db.models import ReportOptOut

# Keeps this signature from ever being valid for another kind of token.
_PURPOSE = b"report-opt-out:v1:"


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload: bytes) -> bytes:
    secret = get_settings().email_token_secret.encode()
    return hmac.new(secret, _PURPOSE + payload, hashlib.sha256).digest()


def make_token(user_id: str, list_id: str) -> str:
    if not get_settings().email_token_secret:
        raise RuntimeError("EMAIL_TOKEN_SECRET is not set")
    payload = f"{user_id}:{list_id}".encode()
    return f"{_b64(payload)}.{_b64(_sign(payload))}"


def read_token(token: str) -> tuple[str, str] | None:
    """(user_id, list_id), or None for a token this deployment did not sign."""
    if not get_settings().email_token_secret:
        return None
    # Bad base64 and bad UTF-8 are both ValueErrors.
    try:
        payload_part, mac_part = token.split(".")
        payload = _unb64(payload_part)
        mac = _unb64(mac_part)
        if not hmac.compare_digest(mac, _sign(payload)):
            return None
        user_id, sep, list_id = payload.decode().partition(":")
    except ValueError:
        return None
    if not sep:
        return None
    return user_id, list_id


def opt_out_url(user_id: str, list_id: str) -> str:
    return f"{get_settings().frontend_url}/u/{make_token(user_id, list_id)}"


def is_opted_out(session: Session, user_id: str, list_id: str) -> bool:
    row = session.exec(
        select(ReportOptOut).where(ReportOptOut.user_id == user_id, ReportOptOut.list_id == list_id)
    ).first()
    return row is not None


def opt_out(session: Session, user_id: str, list_id: str) -> None:
    """Idempotent: a second click, or a mail client's own one-click POST
    after the person's, finds the row and changes nothing."""
    if is_opted_out(session, user_id, list_id):
        return
    try:
        with session.begin_nested():
            session.add(ReportOptOut(user_id=user_id, list_id=list_id))
            session.flush()
    except IntegrityError:
        # A concurrent click inserted it first.
        pass
    session.commit()
