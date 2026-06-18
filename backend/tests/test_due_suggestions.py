from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import ListItem


def _create_list(client):
    return client.post("/lists", json={"name": "Shopping"}).json()


def _add_purchased(session: Session, list_id: str, user_id: str, name: str, purchased_at: datetime):
    """Insert a ListItem directly with a specific purchased_at timestamp."""
    item = ListItem(
        list_id=list_id,
        name=name,
        added_by=user_id,
        purchased_at=purchased_at,
    )
    session.add(item)
    session.commit()


def test_due_suggestions_returns_due_item(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.now(UTC).replace(tzinfo=None)
    # 3 purchases ~14 days apart; last was 14 days ago
    # median=14, 0.9×14=12.6 <= 14 <= 1.5×14=21 ✓
    for i in range(3, 0, -1):
        _add_purchased(session, lst["id"], user.id, "Bananas", now - timedelta(days=14 * i))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    assert response.status_code == 200
    names = [s["name"] for s in response.json()]
    assert "Bananas" in names


def test_due_suggestions_requires_3_purchases(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.now(UTC).replace(tzinfo=None)
    for i in range(2, 0, -1):
        _add_purchased(session, lst["id"], user.id, "Milk", now - timedelta(days=7 * i))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    names = [s["name"] for s in response.json()]
    assert "Milk" not in names


def test_due_suggestions_excludes_unpurchased_items(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.now(UTC).replace(tzinfo=None)
    for i in range(3, 0, -1):
        _add_purchased(session, lst["id"], user.id, "Eggs", now - timedelta(days=14 * i))

    # Add Eggs as currently unpurchased on this list
    client.post(f"/lists/{lst['id']}/items", json={"name": "Eggs"})

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    names = [s["name"] for s in response.json()]
    assert "Eggs" not in names


def test_due_suggestions_excludes_items_outside_upper_bound(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.now(UTC).replace(tzinfo=None)
    # median=14, upper=21. Last purchase 30 days ago → outside window
    _add_purchased(session, lst["id"], user.id, "Cheese", now - timedelta(days=42))
    _add_purchased(session, lst["id"], user.id, "Cheese", now - timedelta(days=28))
    _add_purchased(session, lst["id"], user.id, "Cheese", now - timedelta(days=30))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    names = [s["name"] for s in response.json()]
    assert "Cheese" not in names


def test_due_suggestions_excludes_items_below_lower_bound(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.now(UTC).replace(tzinfo=None)
    # median=14, lower=12.6. Last purchase 10 days ago → below lower bound
    _add_purchased(session, lst["id"], user.id, "Yogurt", now - timedelta(days=38))
    _add_purchased(session, lst["id"], user.id, "Yogurt", now - timedelta(days=24))
    _add_purchased(session, lst["id"], user.id, "Yogurt", now - timedelta(days=10))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    names = [s["name"] for s in response.json()]
    assert "Yogurt" not in names


def test_due_suggestions_sorted_most_overdue_first(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.now(UTC).replace(tzinfo=None)
    # Apples: median=14, last=18d → days_overdue=18-12.6=5.4
    _add_purchased(session, lst["id"], user.id, "Apples", now - timedelta(days=46))
    _add_purchased(session, lst["id"], user.id, "Apples", now - timedelta(days=32))
    _add_purchased(session, lst["id"], user.id, "Apples", now - timedelta(days=18))
    # Bread: median=14, last=20d → days_overdue=20-12.6=7.4 (more overdue)
    _add_purchased(session, lst["id"], user.id, "Bread", now - timedelta(days=48))
    _add_purchased(session, lst["id"], user.id, "Bread", now - timedelta(days=34))
    _add_purchased(session, lst["id"], user.id, "Bread", now - timedelta(days=20))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    names = [s["name"] for s in response.json()]
    assert names.index("Bread") < names.index("Apples")


def test_due_suggestions_non_member_forbidden(other_client: TestClient, client: TestClient):
    lst = client.post("/lists", json={"name": "Private"}).json()
    response = other_client.get(f"/lists/{lst['id']}/due-suggestions")
    assert response.status_code == 403


def test_due_suggestions_includes_median_interval_days(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.now(UTC).replace(tzinfo=None)
    # 3 purchases 14 days apart; median gap = 14
    for i in range(3, 0, -1):
        _add_purchased(session, lst["id"], user.id, "Butter", now - timedelta(days=14 * i))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    assert response.status_code == 200
    data = response.json()
    butter = next(s for s in data if s["name"] == "Butter")
    assert abs(butter["median_interval_days"] - 14) < 0.1


def test_due_suggestions_includes_days_since_last(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.now(UTC).replace(tzinfo=None)
    # Last purchase exactly 14 days ago; median=14
    for i in range(3, 0, -1):
        _add_purchased(session, lst["id"], user.id, "Cream", now - timedelta(days=14 * i))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    assert response.status_code == 200
    data = response.json()
    cream = next(s for s in data if s["name"] == "Cream")
    assert abs(cream["days_since_last"] - 14) < 0.1
