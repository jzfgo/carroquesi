"""Tests for the receipt storage service. GCS is always mocked — the suite
never talks to GCP."""

from datetime import timedelta
from unittest.mock import MagicMock

import pytest

from app.core.config import settings
from app.services import receipt_storage


@pytest.fixture(autouse=True)
def reset_memoised_client():
    receipt_storage._client = None
    yield
    receipt_storage._client = None


@pytest.fixture(name="configured")
def configured_fixture(monkeypatch):
    monkeypatch.setattr(settings, "receipt_storage_bucket", "test-bucket")


@pytest.fixture(name="unconfigured")
def unconfigured_fixture(monkeypatch):
    monkeypatch.setattr(settings, "receipt_storage_bucket", "")


@pytest.fixture(name="mock_client")
def mock_client_fixture(monkeypatch, configured) -> MagicMock:
    client = MagicMock()
    monkeypatch.setattr(receipt_storage, "_get_client", lambda: client)
    return client


def test_is_configured_follows_the_bucket_setting(monkeypatch):
    monkeypatch.setattr(settings, "receipt_storage_bucket", "")
    assert receipt_storage.is_configured() is False
    monkeypatch.setattr(settings, "receipt_storage_bucket", "some-bucket")
    assert receipt_storage.is_configured() is True


def test_generate_upload_url_signs_a_constrained_put(mock_client):
    blob = mock_client.bucket.return_value.blob.return_value
    blob.generate_signed_url.return_value = "https://signed.example/put"

    path, url = receipt_storage.generate_upload_url(
        "list-1", "scan-1", "image/jpeg", max_bytes=10_485_760
    )

    assert path == "receipts/list-1/scan-1.jpg"
    assert url == "https://signed.example/put"
    mock_client.bucket.assert_called_once_with("test-bucket")
    mock_client.bucket.return_value.blob.assert_called_once_with(path)
    kwargs = blob.generate_signed_url.call_args.kwargs
    assert kwargs["version"] == "v4"
    assert kwargs["method"] == "PUT"
    assert kwargs["content_type"] == "image/jpeg"
    assert kwargs["headers"] == {"x-goog-content-length-range": "0,10485760"}
    assert timedelta(0) < kwargs["expiration"] <= timedelta(hours=1)


@pytest.mark.parametrize(
    ("content_type", "ext"),
    [("image/jpeg", "jpg"), ("image/png", "png"), ("image/webp", "webp")],
)
def test_generate_upload_url_maps_content_type_to_extension(mock_client, content_type, ext):
    path, _ = receipt_storage.generate_upload_url("l", "s", content_type, max_bytes=1)
    assert path == f"receipts/l/s.{ext}"


@pytest.mark.parametrize("content_type", ["image/gif", "application/pdf", "text/html", ""])
def test_generate_upload_url_rejects_other_content_types(mock_client, content_type):
    with pytest.raises(ValueError):
        receipt_storage.generate_upload_url("l", "s", content_type, max_bytes=1)
    mock_client.bucket.assert_not_called()


def test_generate_upload_url_unconfigured_raises(unconfigured):
    with pytest.raises(RuntimeError):
        receipt_storage.generate_upload_url("l", "s", "image/jpeg", max_bytes=1)


def test_generate_download_url_signs_a_short_lived_get(mock_client):
    blob = mock_client.bucket.return_value.blob.return_value
    blob.generate_signed_url.return_value = "https://signed.example/get"

    url = receipt_storage.generate_download_url("receipts/list-1/scan-1.jpg")

    assert url == "https://signed.example/get"
    mock_client.bucket.return_value.blob.assert_called_once_with("receipts/list-1/scan-1.jpg")
    kwargs = blob.generate_signed_url.call_args.kwargs
    assert kwargs["version"] == "v4"
    assert kwargs["method"] == "GET"
    assert timedelta(0) < kwargs["expiration"] <= timedelta(hours=1)


def test_generate_download_url_unconfigured_raises(unconfigured):
    with pytest.raises(RuntimeError):
        receipt_storage.generate_download_url("receipts/l/s.jpg")


def test_delete_list_receipts_deletes_the_list_prefix(mock_client):
    bucket = mock_client.bucket.return_value
    blobs = [MagicMock(), MagicMock(), MagicMock()]
    bucket.list_blobs.return_value = blobs

    deleted = receipt_storage.delete_list_receipts("list-1")

    assert deleted == 3
    bucket.list_blobs.assert_called_once_with(prefix="receipts/list-1/")
    for blob in blobs:
        blob.delete.assert_called_once_with()


def test_delete_list_receipts_unconfigured_is_a_noop(unconfigured):
    # No client is mocked: touching GCS here would blow up on missing credentials.
    assert receipt_storage.delete_list_receipts("list-1") == 0
