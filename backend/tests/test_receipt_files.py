"""Tests for the receipt file endpoints: upload-URL mint, download URL, and
the per-trip scan listing. GCS is always mocked — the suite never talks to
GCP."""

from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from sqlmodel import Session

from app.core.config import settings
from app.db.models import List, ListMember, Purchase, ReceiptScan
from app.db.models import UserFeature as _UserFeature
from app.services import receipt_storage

LIST_ID = "list-receipt-files"
SCAN_ID = "scan-under-test"
SIGNED_URL = "https://signed.example/url"


@pytest.fixture(autouse=True)
def enable_receipt_flag(session, user):
    """Grant the flag and consent so most tests exercise the endpoints'
    own behaviour, not the gates in front of them."""
    row = _UserFeature(
        user_id=user.id,
        feature="ai_receipt_scanning",
        enabled=True,
        granted_by="admin",
    )
    user.receipt_consent = "granted"
    user.receipt_consent_at = datetime.now(UTC).replace(tzinfo=None)
    session.add_all([row, user])
    session.commit()


@pytest.fixture(autouse=True)
def seed_list(session, user):
    lst = List(id=LIST_ID, name="Files List", owner_id=user.id)
    member = ListMember(list_id=LIST_ID, user_id=user.id)
    scan = ReceiptScan(id=SCAN_ID, list_id=LIST_ID, scanned_by=user.id, store="Mercadona")
    session.add_all([lst, member, scan])
    session.commit()


@pytest.fixture(autouse=True)
def mock_storage(monkeypatch) -> MagicMock:
    """Configure the bucket and swap the GCS client for a mock. Unconfigured
    tests blank receipt_storage_bucket on top of this."""
    monkeypatch.setattr(settings, "receipt_storage_bucket", "test-bucket")
    receipt_storage._client = None
    client = MagicMock()
    client.bucket.return_value.blob.return_value.generate_signed_url.return_value = SIGNED_URL
    monkeypatch.setattr(receipt_storage, "_get_client", lambda: client)
    yield client
    receipt_storage._client = None


def _mint(client, content_type="image/jpeg", pages=None, list_id=LIST_ID, scan_id=SCAN_ID):
    return client.post(
        f"/lists/{list_id}/receipts/{scan_id}/upload-url",
        json={"content_type": content_type, "pages": pages},
    )


@pytest.fixture(name="other_list_and_scan")
def other_list_and_scan_fixture(session: Session, other_user):
    """A list (and scan) that belongs to other_user, not user."""
    lst = List(id="list-files-other", name="Other List", owner_id=other_user.id)
    member = ListMember(list_id="list-files-other", user_id=other_user.id)
    scan = ReceiptScan(id="scan-other", list_id="list-files-other", scanned_by=other_user.id)
    session.add_all([lst, member, scan])
    session.commit()


# --- upload-url mint ---


def test_mint_answers_the_signed_url_and_its_lifetime(client):
    response = _mint(client)
    assert response.status_code == 200
    body = response.json()
    assert body["upload_url"] == SIGNED_URL
    assert body["expires_in"] == int(receipt_storage.UPLOAD_URL_EXPIRY.total_seconds())


def test_mint_records_the_file_metadata_on_the_scan(client, session, mock_storage):
    response = _mint(client, content_type="image/jpeg")
    assert response.status_code == 200

    session.expire_all()
    scan = session.get(ReceiptScan, SCAN_ID)
    assert scan.file_path == f"receipts/{LIST_ID}/{SCAN_ID}.jpg"
    assert scan.file_content_type == "image/jpeg"
    assert scan.file_pages is None
    # The signature carries the shared cap.
    blob = mock_storage.bucket.return_value.blob.return_value
    kwargs = blob.generate_signed_url.call_args.kwargs
    assert kwargs["headers"] == {
        "x-goog-content-length-range": f"0,{receipt_storage.MAX_RECEIPT_BYTES}"
    }


def test_mint_accepts_a_pdf_and_records_its_pages(client, session):
    response = _mint(client, content_type="application/pdf", pages=3)
    assert response.status_code == 200

    session.expire_all()
    scan = session.get(ReceiptScan, SCAN_ID)
    assert scan.file_path == f"receipts/{LIST_ID}/{SCAN_ID}.pdf"
    assert scan.file_content_type == "application/pdf"
    assert scan.file_pages == 3


def test_mint_ignores_pages_on_an_image(client, session):
    """Only a PDF has pages; a client that sends a count for a photo is
    recorded as NULL, not as a one-page document."""
    response = _mint(client, content_type="image/jpeg", pages=2)
    assert response.status_code == 200

    session.expire_all()
    assert session.get(ReceiptScan, SCAN_ID).file_pages is None


def test_remint_overwrites_the_recorded_file_idempotently(client, session):
    """No confirm step exists: re-minting is how a failed upload heals and
    how a photo is replaced by a PDF. The record follows the latest mint."""
    assert _mint(client, content_type="image/jpeg").status_code == 200
    assert _mint(client, content_type="application/pdf", pages=2).status_code == 200

    session.expire_all()
    scan = session.get(ReceiptScan, SCAN_ID)
    assert scan.file_path == f"receipts/{LIST_ID}/{SCAN_ID}.pdf"
    assert scan.file_content_type == "application/pdf"
    assert scan.file_pages == 2


def test_mint_returns_403_when_flag_disabled(other_client, other_list_and_scan):
    response = _mint(other_client, list_id="list-files-other", scan_id="scan-other")
    assert response.status_code == 403
    assert response.json()["detail"] == "ai_receipt_scanning feature not enabled"


@pytest.mark.parametrize("consent", [None, "declined"])
def test_mint_returns_403_without_consent(client, session, user, consent):
    user.receipt_consent = consent
    session.add(user)
    session.commit()

    response = _mint(client)
    assert response.status_code == 403
    assert response.json()["detail"] == "receipt_consent_required"


def test_mint_consent_answers_before_the_storage_check(client, session, user, monkeypatch):
    """Gate order: an unconsented user is told about consent, not about a
    storage outage that is none of their business yet."""
    monkeypatch.setattr(settings, "receipt_storage_bucket", "")
    user.receipt_consent = None
    session.add(user)
    session.commit()

    response = _mint(client)
    assert response.status_code == 403
    assert response.json()["detail"] == "receipt_consent_required"


def test_mint_returns_503_when_storage_unconfigured(client, monkeypatch):
    monkeypatch.setattr(settings, "receipt_storage_bucket", "")
    assert _mint(client).status_code == 503


def test_mint_returns_404_for_an_unknown_scan(client):
    assert _mint(client, scan_id="no-such-scan").status_code == 404


def test_mint_returns_404_for_another_lists_scan(client, session, other_user):
    """A member of this list must not mint a path into another list's
    prefix, even knowing the scan id."""
    lst = List(id="list-foreign", name="Foreign", owner_id=other_user.id)
    member = ListMember(list_id="list-foreign", user_id=other_user.id)
    scan = ReceiptScan(id="scan-foreign", list_id="list-foreign", scanned_by=other_user.id)
    session.add_all([lst, member, scan])
    session.commit()

    assert _mint(client, scan_id="scan-foreign").status_code == 404


def test_mint_returns_415_for_an_unsupported_type(client, session):
    response = _mint(client, content_type="image/gif")
    assert response.status_code == 415

    session.expire_all()
    assert session.get(ReceiptScan, SCAN_ID).file_path is None


def test_mint_rejects_a_non_positive_page_count(client):
    assert _mint(client, content_type="application/pdf", pages=0).status_code == 422


def test_mint_returns_403_for_a_non_member(other_client):
    """other_user is not on LIST_ID; membership answers before everything."""
    assert _mint(other_client).status_code == 403


# --- file-url download ---


def _stored_scan(session: Session) -> ReceiptScan:
    scan = session.get(ReceiptScan, SCAN_ID)
    scan.file_path = f"receipts/{LIST_ID}/{SCAN_ID}.jpg"
    scan.file_content_type = "image/jpeg"
    session.add(scan)
    session.commit()
    return scan


def test_file_url_answers_the_signed_url_and_metadata(client, session, mock_storage):
    _stored_scan(session)

    response = client.get(f"/lists/{LIST_ID}/receipts/{SCAN_ID}/file-url")
    assert response.status_code == 200
    assert response.json() == {"url": SIGNED_URL, "content_type": "image/jpeg", "pages": None}
    blob = mock_storage.bucket.return_value.blob
    blob.assert_called_once_with(f"receipts/{LIST_ID}/{SCAN_ID}.jpg")
    assert blob.return_value.generate_signed_url.call_args.kwargs["method"] == "GET"


def test_file_url_carries_the_pdf_page_count(client, session):
    scan = _stored_scan(session)
    scan.file_path = f"receipts/{LIST_ID}/{SCAN_ID}.pdf"
    scan.file_content_type = "application/pdf"
    scan.file_pages = 4
    session.add(scan)
    session.commit()

    body = client.get(f"/lists/{LIST_ID}/receipts/{SCAN_ID}/file-url").json()
    assert body["content_type"] == "application/pdf"
    assert body["pages"] == 4


def test_file_url_needs_no_flag_or_consent(client, session, user):
    """Viewing what the household stored is not the act consent gates: a
    member who declined must still be able to check the paper."""
    _stored_scan(session)
    user.receipt_consent = "declined"
    session.add(user)
    session.commit()

    assert client.get(f"/lists/{LIST_ID}/receipts/{SCAN_ID}/file-url").status_code == 200


def test_file_url_returns_404_when_no_file_was_ever_minted(client):
    assert client.get(f"/lists/{LIST_ID}/receipts/{SCAN_ID}/file-url").status_code == 404


def test_file_url_returns_404_for_an_unknown_scan(client):
    assert client.get(f"/lists/{LIST_ID}/receipts/no-such-scan/file-url").status_code == 404


def test_file_url_returns_503_when_storage_unconfigured(client, session, monkeypatch):
    _stored_scan(session)
    monkeypatch.setattr(settings, "receipt_storage_bucket", "")

    assert client.get(f"/lists/{LIST_ID}/receipts/{SCAN_ID}/file-url").status_code == 503


def test_file_url_returns_403_for_a_non_member(other_client, session):
    _stored_scan(session)
    assert other_client.get(f"/lists/{LIST_ID}/receipts/{SCAN_ID}/file-url").status_code == 403


# --- purchase receipt-scan listing ---


PURCHASE_ID = "purchase-files"


@pytest.fixture(name="trip_with_scans")
def trip_with_scans_fixture(session: Session, user):
    trip = Purchase(
        id=PURCHASE_ID,
        list_id=LIST_ID,
        tears_off_at=datetime(2026, 4, 12, 0, 0),
        closed_at=datetime(2026, 4, 11, 19, 0),
        store="Mercadona",
        total=42.5,
    )
    with_file = ReceiptScan(
        id="scan-with-file",
        list_id=LIST_ID,
        scanned_by=user.id,
        store="Mercadona",
        receipt_at=datetime(2026, 4, 11, 17, 42),
        receipt_total=42.5,
        purchase_id=PURCHASE_ID,
        file_path=f"receipts/{LIST_ID}/scan-with-file.pdf",
        file_content_type="application/pdf",
        file_pages=2,
        created_at=datetime(2026, 4, 11, 18, 0),
    )
    without_file = ReceiptScan(
        id="scan-without-file",
        list_id=LIST_ID,
        scanned_by=user.id,
        purchase_id=PURCHASE_ID,
        created_at=datetime(2026, 4, 11, 18, 5),
    )
    session.add_all([trip, with_file, without_file])
    session.commit()


def test_purchase_scans_lists_the_trips_scans_oldest_first(client, trip_with_scans):
    response = client.get(f"/lists/{LIST_ID}/purchases/{PURCHASE_ID}/receipt-scans")
    assert response.status_code == 200
    body = response.json()
    assert [scan["id"] for scan in body] == ["scan-with-file", "scan-without-file"]

    first = body[0]
    assert first["store"] == "Mercadona"
    assert first["receipt_at"] == "2026-04-11T17:42:00"
    assert first["receipt_total"] == pytest.approx(42.5)
    assert first["has_file"] is True
    assert first["file_pages"] == 2
    assert first["created_at"] == "2026-04-11T18:00:00"
    # The listing points at files, it never signs URLs itself.
    assert "file_path" not in first
    assert "url" not in first

    second = body[1]
    assert second["has_file"] is False
    assert second["file_pages"] is None


def test_purchase_scans_excludes_unlinked_scans(client, trip_with_scans):
    """The seeded SCAN_ID scan has no purchase link; it is another trip's
    (or no trip's) evidence, not this one's."""
    body = client.get(f"/lists/{LIST_ID}/purchases/{PURCHASE_ID}/receipt-scans").json()
    assert all(scan["id"] != SCAN_ID for scan in body)


def test_purchase_scans_answers_an_empty_list_for_a_scanless_trip(client, session):
    trip = Purchase(id="purchase-bare", list_id=LIST_ID, tears_off_at=datetime(2026, 4, 12))
    session.add(trip)
    session.commit()

    response = client.get(f"/lists/{LIST_ID}/purchases/purchase-bare/receipt-scans")
    assert response.status_code == 200
    assert response.json() == []


def test_purchase_scans_needs_no_flag_or_consent(client, session, user, trip_with_scans):
    user.receipt_consent = "declined"
    session.add(user)
    session.commit()

    response = client.get(f"/lists/{LIST_ID}/purchases/{PURCHASE_ID}/receipt-scans")
    assert response.status_code == 200


def test_purchase_scans_returns_404_for_an_unknown_purchase(client):
    response = client.get(f"/lists/{LIST_ID}/purchases/no-such-purchase/receipt-scans")
    assert response.status_code == 404


def test_purchase_scans_returns_404_for_another_lists_purchase(
    client, session, other_user, second_list
):
    """Naming your own list does not open another list's trip."""
    trip = Purchase(
        id="purchase-foreign",
        list_id=second_list["id"],
        tears_off_at=datetime(2026, 4, 12),
    )
    session.add(trip)
    session.commit()

    response = client.get(f"/lists/{LIST_ID}/purchases/purchase-foreign/receipt-scans")
    assert response.status_code == 404


def test_purchase_scans_returns_403_for_a_non_member(other_client, trip_with_scans):
    response = other_client.get(f"/lists/{LIST_ID}/purchases/{PURCHASE_ID}/receipt-scans")
    assert response.status_code == 403
