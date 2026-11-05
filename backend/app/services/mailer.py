"""Outgoing email over plain SMTP.

Any provider that speaks SMTP works, so a self-hosted deployment picks its
own. Every message goes through send(), which is the one place that applies
EMAIL_REDIRECT_TO: no caller can reach a real inbox from staging by mistake.
"""

import logging
import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import make_msgid

from app.core.config import get_settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 15
IMPLICIT_TLS_PORT = 465


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    text: str
    html: str
    headers: dict[str, str] = field(default_factory=dict)


def is_configured() -> bool:
    settings = get_settings()
    return bool(settings.smtp_host and settings.email_from)


def send(email: Email) -> bool:
    """Send one email. False when it could not be sent; the error is logged.

    It never raises for a delivery problem, so a caller cannot break on one.
    A caller that must remember the outcome records the return value.
    """
    if not is_configured():
        logger.warning("Email not sent: SMTP is not configured")
        return False
    msg = _build(email)
    try:
        _deliver(msg)
    except smtplib.SMTPException, OSError:
        logger.exception("Email failed: %s", email.subject)
        return False
    return True


def _build(email: Email) -> EmailMessage:
    settings = get_settings()
    msg = EmailMessage()
    msg["From"] = settings.email_from
    subject = email.subject
    redirect = settings.email_redirect_to
    if redirect:
        # The real recipient stays visible, so a redirected email can still
        # be checked against the person it was meant for.
        msg["To"] = redirect
        msg["X-Original-To"] = email.to
        subject = f"[{email.to}] {subject}"
    else:
        msg["To"] = email.to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid()
    for name, value in email.headers.items():
        msg[name] = value
    msg.set_content(email.text)
    msg.add_alternative(email.html, subtype="html")
    return msg


def _deliver(msg: EmailMessage) -> None:
    settings = get_settings()
    context = ssl.create_default_context()
    if settings.smtp_port == IMPLICIT_TLS_PORT:
        server: smtplib.SMTP = smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=TIMEOUT_SECONDS, context=context
        )
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=TIMEOUT_SECONDS)
    with server:
        server.ehlo()
        encrypted = settings.smtp_port == IMPLICIT_TLS_PORT
        # A local test server (Mailpit) offers no TLS; a real provider does.
        if not encrypted and server.has_extn("starttls"):
            server.starttls(context=context)
            server.ehlo()
            encrypted = True
        if settings.smtp_user:
            # Someone in the middle can strip the STARTTLS offer. Without
            # this check the password would then go out in clear text.
            if not encrypted:
                raise smtplib.SMTPNotSupportedError("no TLS: refusing to send the password")
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)
