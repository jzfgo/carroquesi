import html

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import get_settings
from app.db.models import List, ListInvite, User
from app.db.session import get_session
from app.routers import share


@pytest.fixture(name="client")
def client_fixture(session: Session):
    # The page is public, so a bare app with only this router and no auth.
    app = FastAPI()
    app.include_router(share.router)
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c


def _invite(session: Session, user: User, name: str, emoji: str | None = None):
    lst = List(name=name, emoji=emoji, owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    invite = ListInvite(list_id=lst.id, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)
    return invite


def test_share_page_names_list_and_inviter(client: TestClient, session: Session, user: User):
    invite = _invite(session, user, "Compra", emoji="🥦")

    response = client.get(f"/i/{invite.id}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    body = response.text
    title = html.escape("🥦 Compra — CarroQueSí")
    assert f"<title>{title}</title>" in body
    assert f'<meta property="og:title" content="{title}" />' in body
    description = html.escape(f"{user.display_name} te invitó a unirse a 'Compra' en CarroQueSí")
    assert f'<meta property="og:description" content="{description}" />' in body
    og_image = f"{get_settings().frontend_url}/og-image.png"
    assert f'<meta property="og:image" content="{og_image}" />' in body
    assert f'content="0;url=/invite/{invite.id}"' in body
    assert f'window.location.replace("/invite/{invite.id}")' in body


def test_share_page_without_emoji_has_no_prefix(client: TestClient, session: Session, user: User):
    invite = _invite(session, user, "Compra")

    body = client.get(f"/i/{invite.id}").text

    assert f"<title>{html.escape('Compra — CarroQueSí')}</title>" in body


def test_share_page_unknown_invite_falls_back(client: TestClient):
    response = client.get("/i/missing-token")

    assert response.status_code == 200
    body = response.text
    assert f"<title>{html.escape('una lista — CarroQueSí')}</title>" in body
    assert html.escape("Te invitaron a unirse a 'una lista' en CarroQueSí") in body
    assert 'content="0;url=/invite/missing-token"' in body


def test_share_page_escapes_list_name(client: TestClient, session: Session, user: User):
    invite = _invite(session, user, '<script>alert("x")</script>')

    body = client.get(f"/i/{invite.id}").text

    assert "<script>alert" not in body
    assert "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;" in body


def test_share_page_escapes_token_in_script(client: TestClient):
    # The token is a path segment, so it can carry markup. Inside <script> the
    # browser does not decode HTML entities, so the JS string must use \u escapes.
    body = client.get("/i/a%3Cb%3Ec").text

    assert "a<b>c" not in body
    assert 'window.location.replace("/invite/a\\u003cb\\u003ec")' in body
    assert 'content="0;url=/invite/a&lt;b&gt;c"' in body
