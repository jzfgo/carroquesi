import smtplib
from email.message import EmailMessage

import pytest

from app.core.config import get_settings
from app.services import mailer
from app.services.mailer import Email


class FakeSMTP:
    """Stands in for smtplib.SMTP and SMTP_SSL, recording what it is asked."""

    instances: list[FakeSMTP] = []
    offers_starttls = True
    fail_with: Exception | None = None
    quit_fails = False

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port = host, port
        self.started_tls = False
        self.logged_in: tuple[str, str] | None = None
        self.sent: list[EmailMessage] = []
        self.closed = False
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def quit(self):
        self.closed = True
        if FakeSMTP.quit_fails:
            raise smtplib.SMTPServerDisconnected("gone")

    def close(self):
        self.closed = True

    def ehlo(self):
        pass

    def has_extn(self, name):
        return name == "starttls" and self.offers_starttls

    def starttls(self, context=None):
        self.started_tls = True

    def login(self, user, password):
        self.logged_in = (user, password)

    def send_message(self, msg):
        if FakeSMTP.fail_with is not None:
            raise FakeSMTP.fail_with
        self.sent.append(msg)


class FakeSMTPSSL(FakeSMTP):
    offers_starttls = False


@pytest.fixture(autouse=True)
def smtp(monkeypatch):
    FakeSMTP.instances = []
    FakeSMTP.fail_with = None
    FakeSMTP.quit_fails = False
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTPSSL)
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_user", "")
    monkeypatch.setattr(settings, "smtp_password", "")
    monkeypatch.setattr(settings, "email_from", "CarroQueSí <informes@example.com>")
    monkeypatch.setattr(settings, "email_redirect_to", "")
    return settings


EMAIL = Email(
    to="alice@example.com",
    subject="Tu gasto",
    text="Hola",
    html="<p>Hola</p>",
    headers={"List-Unsubscribe": "<https://example.com/u/x>"},
)


def _sent() -> EmailMessage:
    (server,) = FakeSMTP.instances
    (msg,) = server.sent
    return msg


def test_sends_text_and_html_to_the_recipient():
    assert mailer.send(EMAIL) is True

    msg = _sent()
    assert msg["To"] == "alice@example.com"
    assert msg["From"] == "CarroQueSí <informes@example.com>"
    assert msg["Subject"] == "Tu gasto"
    assert msg["List-Unsubscribe"] == "<https://example.com/u/x>"
    assert msg["X-Original-To"] is None
    text = msg.get_body(("plain",))
    html = msg.get_body(("html",))
    assert text is not None and html is not None
    assert isinstance(text, EmailMessage) and text.get_content().strip() == "Hola"
    assert isinstance(html, EmailMessage) and html.get_content().strip() == "<p>Hola</p>"


def test_redirect_sends_to_the_redirect_and_keeps_the_real_recipient_visible(smtp):
    smtp.email_redirect_to = "qa@example.com"

    assert mailer.send(EMAIL) is True

    msg = _sent()
    assert msg["To"] == "qa@example.com"
    assert msg["X-Original-To"] == "alice@example.com"
    assert msg["Subject"] == "[alice@example.com] Tu gasto"


def test_upgrades_with_starttls_and_logs_in_when_a_user_is_set(smtp):
    smtp.smtp_user = "resend"
    smtp.smtp_password = "key"

    mailer.send(EMAIL)

    (server,) = FakeSMTP.instances
    assert type(server) is FakeSMTP
    assert server.started_tls
    assert server.logged_in == ("resend", "key")


def test_port_465_uses_tls_from_the_start(smtp):
    smtp.smtp_port = 465

    mailer.send(EMAIL)

    (server,) = FakeSMTP.instances
    assert type(server) is FakeSMTPSSL
    assert not server.started_tls


def test_port_465_logs_in_over_its_own_tls(smtp):
    smtp.smtp_port = 465
    smtp.smtp_user = "resend"

    assert mailer.send(EMAIL) is True

    (server,) = FakeSMTP.instances
    assert server.logged_in == ("resend", "")


def test_the_password_never_goes_out_without_tls(smtp, monkeypatch):
    monkeypatch.setattr(FakeSMTP, "offers_starttls", False)
    smtp.smtp_user = "resend"
    smtp.smtp_password = "key"

    assert mailer.send(EMAIL) is False

    (server,) = FakeSMTP.instances
    assert server.logged_in is None
    assert server.sent == []


def test_a_server_without_tls_or_login_still_sends(smtp, monkeypatch):
    monkeypatch.setattr(FakeSMTP, "offers_starttls", False)

    assert mailer.send(EMAIL) is True

    (server,) = FakeSMTP.instances
    assert not server.started_tls
    assert server.logged_in is None


@pytest.mark.parametrize(
    "error", [smtplib.SMTPRecipientsRefused({}), ConnectionRefusedError(), TimeoutError()]
)
def test_a_failed_send_returns_false_instead_of_raising(error):
    FakeSMTP.fail_with = error

    assert mailer.send(EMAIL) is False


@pytest.mark.parametrize("field", ["smtp_host", "email_from"])
def test_without_a_host_or_sender_email_is_off(smtp, field):
    setattr(smtp, field, "")

    assert mailer.is_configured() is False
    assert mailer.send(EMAIL) is False
    assert FakeSMTP.instances == []


def test_an_error_at_quit_after_the_send_still_counts_as_sent():
    FakeSMTP.quit_fails = True

    assert mailer.send(EMAIL) is True
    assert _sent() is not None


def test_the_connection_is_closed_after_a_failed_send():
    FakeSMTP.fail_with = smtplib.SMTPDataError(554, b"no")

    assert mailer.send(EMAIL) is False
    (server,) = FakeSMTP.instances
    assert server.closed


def test_a_subject_with_a_line_break_fails_the_send_instead_of_raising():
    bad = Email(to="alice@example.com", subject="Casa\nBcc: x@example.com", text="", html="")

    assert mailer.send(bad) is False
    assert FakeSMTP.instances == []
