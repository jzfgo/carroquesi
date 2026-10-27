"""Tests for the receipt storage service. GCS is always mocked — the suite
never talks to GCP."""

import io
from datetime import timedelta
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from google.api_core.exceptions import NotFound, PreconditionFailed
from PIL import Image

from app.core.config import get_settings
from app.services import receipt_storage


@pytest.fixture(autouse=True)
def reset_memoised_client():
    receipt_storage._get_client.cache_clear()
    yield
    receipt_storage._get_client.cache_clear()


@pytest.fixture(name="configured")
def configured_fixture(monkeypatch):
    monkeypatch.setattr(get_settings(), "receipt_storage_bucket", "test-bucket")


@pytest.fixture(name="unconfigured")
def unconfigured_fixture(monkeypatch):
    monkeypatch.setattr(get_settings(), "receipt_storage_bucket", "")


@pytest.fixture(name="mock_client")
def mock_client_fixture(monkeypatch, configured) -> MagicMock:
    client = MagicMock()
    monkeypatch.setattr(receipt_storage, "_get_client", lambda: client)
    return client


def test_is_configured_follows_the_bucket_setting(monkeypatch):
    monkeypatch.setattr(get_settings(), "receipt_storage_bucket", "")
    assert receipt_storage.is_configured() is False
    monkeypatch.setattr(get_settings(), "receipt_storage_bucket", "some-bucket")
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
    [
        ("image/jpeg", "jpg"),
        ("image/png", "png"),
        ("image/webp", "webp"),
        ("application/pdf", "pdf"),
    ],
)
def test_generate_upload_url_maps_content_type_to_extension(mock_client, content_type, ext):
    path, _ = receipt_storage.generate_upload_url("l", "s", content_type, max_bytes=1)
    assert path == f"receipts/l/s.{ext}"


@pytest.mark.parametrize("content_type", ["image/gif", "text/html", ""])
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


def _jpeg(size: tuple[int, int], exif_orientation: int | None = None) -> bytes:
    img = Image.new("RGB", size, "white")
    out = io.BytesIO()
    exif = Image.Exif()
    if exif_orientation is not None:
        exif[0x0112] = exif_orientation
    img.save(out, "JPEG", exif=exif)
    return out.getvalue()


@pytest.fixture(name="blobs")
def blobs_fixture(mock_client) -> dict[str, MagicMock]:
    """One mock blob per object path, so original and miniature stay apart."""
    blobs: dict[str, MagicMock] = {}

    def blob(path: str) -> MagicMock:
        if path not in blobs:
            blobs[path] = MagicMock()
            blobs[path].generate_signed_url.return_value = f"https://signed.example/{path}"
        return blobs[path]

    mock_client.bucket.return_value.blob.side_effect = blob
    return blobs


ORIGINAL = "receipts/list-1/scan-1.jpg"
THUMB = "receipts/list-1/scan-1.thumb.jpg"


def test_render_thumbnail_fits_the_box_as_a_jpeg():
    rendered = receipt_storage.render_thumbnail(_jpeg((3000, 4000)))

    with Image.open(io.BytesIO(rendered)) as img:
        assert img.format == "JPEG"
        assert img.width <= receipt_storage.THUMB_SIZE[0]
        assert img.height <= receipt_storage.THUMB_SIZE[1]
    assert len(rendered) < 20_000


def test_render_thumbnail_keeps_a_long_receipt_wide_enough():
    """The box is cropped from the top, so a tall receipt is bounded by
    width, not squeezed to fit a square."""
    rendered = receipt_storage.render_thumbnail(_jpeg((1000, 4000)))

    with Image.open(io.BytesIO(rendered)) as img:
        assert img.size == (160, 640)


def test_render_thumbnail_applies_the_exif_rotation():
    # Orientation 6: stored landscape, shown portrait.
    rendered = receipt_storage.render_thumbnail(_jpeg((4000, 3000), exif_orientation=6))

    with Image.open(io.BytesIO(rendered)) as img:
        assert img.height > img.width


def test_render_thumbnail_reads_png_with_alpha():
    out = io.BytesIO()
    Image.new("RGBA", (800, 1200), (255, 255, 255, 128)).save(out, "PNG")

    rendered = receipt_storage.render_thumbnail(out.getvalue())

    with Image.open(io.BytesIO(rendered)) as img:
        assert img.format == "JPEG"


@pytest.mark.parametrize("data", [b"%PDF-1.7 not an image", b"", b"\xff\xd8 truncated"])
def test_render_thumbnail_answers_none_for_non_images(data):
    assert receipt_storage.render_thumbnail(data) is None


def test_render_thumbnail_answers_none_for_broken_exif(monkeypatch):
    def broken(img):
        raise ValueError("bad EXIF")

    monkeypatch.setattr(receipt_storage.ImageOps, "exif_transpose", broken)

    assert receipt_storage.render_thumbnail(_jpeg((400, 300))) is None


def test_render_thumbnail_refuses_an_oversized_image(monkeypatch):
    monkeypatch.setattr(receipt_storage, "_MAX_DECODE_PIXELS", 100)
    out = io.BytesIO()
    Image.new("RGB", (20, 20)).save(out, "PNG")

    assert receipt_storage.render_thumbnail(out.getvalue()) is None


def _original(blobs, path=ORIGINAL, data=None, generation=7) -> MagicMock:
    original = blobs.setdefault(path, MagicMock())
    original.generation = generation
    original.download_as_bytes.return_value = data if data is not None else _jpeg((3000, 4000))
    return original


def _thumb(blobs, source_generation=None) -> MagicMock:
    thumb = blobs.setdefault(THUMB, MagicMock())
    if source_generation is None:
        thumb.reload.side_effect = NotFound("none")
        thumb.metadata = None
    else:
        thumb.metadata = {"source_generation": str(source_generation)}
    thumb.generate_signed_url.return_value = "https://signed.example/thumb"
    return thumb


def test_thumbnail_url_renders_and_stores_on_first_ask(blobs):
    original = _original(blobs)
    thumb = _thumb(blobs)

    url = receipt_storage.thumbnail_download_url("list-1", "scan-1", ORIGINAL)

    assert url == "https://signed.example/thumb"
    original.download_as_bytes.assert_called_once_with(if_generation_match=7)
    data = thumb.upload_from_string.call_args.args[0]
    assert thumb.upload_from_string.call_args.kwargs["content_type"] == "image/jpeg"
    assert thumb.metadata == {"source_generation": "7"}
    with Image.open(io.BytesIO(data)) as img:
        assert img.width <= receipt_storage.THUMB_SIZE[0]
    kwargs = thumb.generate_signed_url.call_args.kwargs
    assert kwargs["method"] == "GET"
    assert kwargs["expiration"] == receipt_storage.DOWNLOAD_URL_EXPIRY


def test_thumbnail_url_only_signs_while_the_original_is_unchanged(blobs):
    original = _original(blobs, generation=7)
    thumb = _thumb(blobs, source_generation=7)

    assert receipt_storage.thumbnail_download_url("list-1", "scan-1", ORIGINAL) == (
        "https://signed.example/thumb"
    )
    original.download_as_bytes.assert_not_called()
    thumb.upload_from_string.assert_not_called()


def test_thumbnail_url_renders_again_once_the_original_is_replaced(blobs):
    original = _original(blobs, generation=8)
    thumb = _thumb(blobs, source_generation=7)

    receipt_storage.thumbnail_download_url("list-1", "scan-1", ORIGINAL)

    original.download_as_bytes.assert_called_once_with(if_generation_match=8)
    thumb.upload_from_string.assert_called_once()
    assert thumb.metadata == {"source_generation": "8"}


def test_thumbnail_url_stores_nothing_when_the_original_changes_mid_render(blobs):
    original = _original(blobs)
    original.download_as_bytes.side_effect = PreconditionFailed("replaced")
    thumb = _thumb(blobs)

    assert receipt_storage.thumbnail_download_url("list-1", "scan-1", ORIGINAL) is None
    thumb.upload_from_string.assert_not_called()


def test_thumbnail_url_answers_none_while_the_upload_is_in_flight(blobs):
    original = _original(blobs)
    original.reload.side_effect = NotFound("gone")
    # A miniature of a file at another path must not be served instead.
    thumb = _thumb(blobs, source_generation=3)

    assert receipt_storage.thumbnail_download_url("list-1", "scan-1", ORIGINAL) is None
    thumb.upload_from_string.assert_not_called()
    thumb.generate_signed_url.assert_not_called()


def test_thumbnail_url_answers_none_for_a_pdf(blobs):
    pdf = "receipts/list-1/scan-1.pdf"
    _original(blobs, path=pdf, data=b"%PDF-1.7")
    thumb = _thumb(blobs)

    assert receipt_storage.thumbnail_download_url("list-1", "scan-1", pdf) is None
    thumb.upload_from_string.assert_not_called()


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


def test_delete_list_purges_receipt_objects(client: TestClient, monkeypatch):
    deleted_lists: list[str] = []
    monkeypatch.setattr(
        receipt_storage, "delete_list_receipts", lambda list_id: deleted_lists.append(list_id) or 0
    )
    created = client.post("/lists", json={"name": "Con Ticket"}).json()

    response = client.delete(f"/lists/{created['id']}")

    assert response.status_code == 204
    assert deleted_lists == [created["id"]]


def test_delete_list_survives_a_storage_error(client: TestClient, monkeypatch):
    def boom(list_id: str) -> int:
        raise RuntimeError("gcs down")

    monkeypatch.setattr(receipt_storage, "delete_list_receipts", boom)
    created = client.post("/lists", json={"name": "To Delete"}).json()

    response = client.delete(f"/lists/{created['id']}")

    assert response.status_code == 204
    assert client.get(f"/lists/{created['id']}").status_code == 404
