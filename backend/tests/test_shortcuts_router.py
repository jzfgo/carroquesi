import plistlib

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import ApiKey, User


def test_download_without_any_lists_returns_409(client: TestClient):
    response = client.get("/shortcuts/cqs.shortcut")
    assert response.status_code == 409


def test_download_returns_binary_plist_and_creates_a_key(
    client: TestClient, session: Session, user: User
):
    client.post("/lists", json={"name": "Mercado"})

    response = client.get("/shortcuts/cqs.shortcut")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.headers["content-disposition"] == 'attachment; filename="CarroQueSi.shortcut"'
    workflow = plistlib.loads(response.content)
    identifiers = {a["WFWorkflowActionIdentifier"] for a in workflow["WFWorkflowActions"]}
    assert "is.workflow.actions.downloadurl" in identifiers

    api_key = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first()
    assert api_key is not None


def test_download_reuses_existing_key_on_second_call(
    client: TestClient, session: Session, user: User
):
    client.post("/lists", json={"name": "Mercado"})
    client.get("/shortcuts/cqs.shortcut")
    first = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first()
    first_hash = first.key_hash

    client.get("/shortcuts/cqs.shortcut")
    session.refresh(first)
    assert first.key_hash == first_hash


def test_download_embeds_most_recently_updated_list(client: TestClient):
    client.post("/lists", json={"name": "Old"})
    newest = client.post("/lists", json={"name": "New"}).json()
    client.patch(f"/lists/{newest['id']}", json={"name": "New"})  # bump updated_at

    response = client.get("/shortcuts/cqs.shortcut")
    workflow = plistlib.loads(response.content)
    post_action = next(
        a
        for a in workflow["WFWorkflowActions"]
        if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl"
        and a["WFWorkflowActionParameters"].get("WFHTTPMethod") == "POST"
    )
    assert newest["id"] in post_action["WFWorkflowActionParameters"]["WFURL"]


def test_download_never_embeds_another_users_list(client: TestClient, other_client: TestClient):
    mine = client.post("/lists", json={"name": "Mine"}).json()

    theirs = other_client.post("/lists", json={"name": "Theirs"}).json()
    other_client.patch(f"/lists/{theirs['id']}", json={"name": "Theirs"})  # bump updated_at

    response = client.get("/shortcuts/cqs.shortcut")
    workflow = plistlib.loads(response.content)
    post_action = next(
        a
        for a in workflow["WFWorkflowActions"]
        if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl"
        and a["WFWorkflowActionParameters"].get("WFHTTPMethod") == "POST"
    )
    embedded_url = post_action["WFWorkflowActionParameters"]["WFURL"]
    assert mine["id"] in embedded_url
    assert theirs["id"] not in embedded_url


def test_regenerate_rotates_the_key_hash(client: TestClient, session: Session, user: User):
    client.post("/lists", json={"name": "Mercado"})
    client.get("/shortcuts/cqs.shortcut")
    before = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first()
    before_hash = before.key_hash

    response = client.post("/account/api-key/regenerate")

    assert response.status_code == 200
    session.refresh(before)
    assert before.key_hash != before_hash
    assert before.last_used_at is None


def test_regenerate_without_existing_key_creates_one(
    client: TestClient, session: Session, user: User
):
    response = client.post("/account/api-key/regenerate")
    assert response.status_code == 200
    api_key = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first()
    assert api_key is not None
