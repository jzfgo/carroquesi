"""Receipt image storage in Google Cloud Storage.

Decision: docs/decisions/015-gcs-receipt-storage-signed-urls.md

The bucket is private and its storage rules deny everything. Clients reach
objects only through the short-lived V4 signed URLs minted here, after the
caller has checked list membership in Postgres. Signing happens locally with
the private key in the service-account file — the same file the Firebase Admin
SDK uses — so it needs no IAM round-trip, but it also means a move to keyless
workload identity would have to switch to IAM-based signing (signBlob).

Objects live under ``receipts/{list_id}/`` so retention follows the list: one
prefix delete removes a list's receipts when the list itself is deleted.
"""

from __future__ import annotations

import io
import threading
from datetime import timedelta
from pathlib import Path

from google.api_core.exceptions import NotFound, PreconditionFailed
from google.cloud import storage
from PIL import Image, ImageOps

from app.core.config import settings

# Short-lived on purpose: a URL is minted per request and used immediately.
# The upload window is wider so a slow mobile connection can finish pushing a
# multi-megabyte photo before the signature expires.
UPLOAD_URL_EXPIRY = timedelta(minutes=15)
DOWNLOAD_URL_EXPIRY = timedelta(minutes=10)

# One cap for every receipt file, image or PDF. Enforced inside the signed
# URL's length condition, so GCS applies it even though the bytes never pass
# through the backend.
MAX_RECEIPT_BYTES = 10 * 1024 * 1024

# Allowed receipt file types, mapped to the object name extension. PDF sits
# beside the image types because supermarket apps export multi-page receipts
# as PDF.
_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
}

# What an upload may declare; the API edge answers anything else with 415.
ALLOWED_CONTENT_TYPES = frozenset(_EXTENSIONS)

# The miniature's bounding box. The trip header draws it as a small portrait
# box, top-aligned and cropped, so width is what matters: 160px covers that
# box on a 3x phone screen. The tall height limit keeps a long receipt from
# being squeezed to a sliver.
THUMB_SIZE = (160, 640)
THUMB_QUALITY = 75

# Refuse to decode anything larger. A JPEG decodes at reduced scale and stays
# far below this; a huge PNG decodes in full and could exhaust the instance's
# memory.
_MAX_DECODE_PIXELS = 40_000_000

# How many miniatures may decode at once. One large decode is fine; a list
# opening many unviewed trips would otherwise run one per request thread.
_RENDER_SLOTS = threading.BoundedSemaphore(2)

# Metadata key on a miniature: the generation of the original it was made
# from. A re-upload to the same path gets a new generation, so a mismatch
# means the miniature shows a file that is gone.
_SOURCE_GENERATION = "source_generation"

_client: storage.Client | None = None


def _get_client() -> storage.Client:
    """Memoised GCS client built from the service-account key file.

    Built from the key file explicitly rather than application-default
    credentials: V4 signing needs the private key locally, and only the key
    file carries one.
    """
    global _client
    if _client is None:
        _client = storage.Client.from_service_account_json(
            str(Path(settings.firebase_credentials_path).expanduser())
        )
    return _client


def is_configured() -> bool:
    """Whether receipt storage is enabled. Callers must gate on this."""
    return bool(settings.receipt_storage_bucket)


def _bucket() -> storage.Bucket:
    if not is_configured():
        raise RuntimeError("Receipt storage is not configured (RECEIPT_STORAGE_BUCKET is empty)")
    return _get_client().bucket(settings.receipt_storage_bucket)


def generate_upload_url(
    list_id: str, scan_id: str, content_type: str, max_bytes: int
) -> tuple[str, str]:
    """Mint a signed PUT URL for one receipt image; return (object_path, url).

    The signature binds the exact content type and a length range of
    ``0,max_bytes``. GCS rejects an upload that breaks either condition, so
    the limits hold even though the bytes never pass through the backend.
    """
    ext = _EXTENSIONS.get(content_type)
    if ext is None:
        raise ValueError(f"Unsupported receipt content type: {content_type}")
    path = f"receipts/{list_id}/{scan_id}.{ext}"
    url = (
        _bucket()
        .blob(path)
        .generate_signed_url(
            version="v4",
            expiration=UPLOAD_URL_EXPIRY,
            method="PUT",
            content_type=content_type,
            headers={"x-goog-content-length-range": f"0,{max_bytes}"},
        )
    )
    return path, url


def generate_download_url(path: str) -> str:
    """Mint a signed GET URL for a stored receipt object path."""
    return (
        _bucket()
        .blob(path)
        .generate_signed_url(
            version="v4",
            expiration=DOWNLOAD_URL_EXPIRY,
            method="GET",
        )
    )


def thumbnail_path(list_id: str, scan_id: str) -> str:
    """Where a scan's miniature lives. Keyed by scan, not by the original's
    extension, so a re-upload in another format still finds it. It sits under
    the list prefix, so the list-delete purge removes it too."""
    return f"receipts/{list_id}/{scan_id}.thumb.jpg"


def thumbnail_download_url(list_id: str, scan_id: str, file_path: str) -> str | None:
    """Mint a signed GET URL for a scan's miniature, making it when needed.

    The original can be up to 10 MB, far too heavy for a small box in a list.
    A request downloads it once, renders a small JPEG, and stores that beside
    it with the original's generation; later requests only sign, until the
    original is replaced. Returns None when no miniature can be made: the
    upload has not landed yet, or the bytes are not an image. Nothing is
    stored then, so a later request tries again.
    """
    bucket = _bucket()
    original = bucket.blob(file_path)
    try:
        original.reload()
    except NotFound:
        return None
    source = str(original.generation)
    thumb = bucket.blob(thumbnail_path(list_id, scan_id))
    try:
        thumb.reload()
        fresh = (thumb.metadata or {}).get(_SOURCE_GENERATION) == source
    except NotFound:
        fresh = False
    if not fresh:
        try:
            # Pinned to the generation just read: bytes replaced in between
            # must not be stored under the old generation.
            data = original.download_as_bytes(if_generation_match=original.generation)
        except (NotFound, PreconditionFailed):
            return None
        rendered = render_thumbnail(data)
        if rendered is None:
            return None
        thumb.metadata = {_SOURCE_GENERATION: source}
        thumb.upload_from_string(rendered, content_type="image/jpeg")
    return thumb.generate_signed_url(
        version="v4",
        expiration=DOWNLOAD_URL_EXPIRY,
        method="GET",
    )


def render_thumbnail(data: bytes) -> bytes | None:
    """Shrink an image to a THUMB_SIZE JPEG, or None if it cannot be read."""
    try:
        with _RENDER_SLOTS, Image.open(io.BytesIO(data)) as img:
            # JPEG only: decode at a reduced scale instead of in full.
            img.draft("RGB", THUMB_SIZE)
            if img.width * img.height > _MAX_DECODE_PIXELS:
                return None
            # Phone photos are often stored sideways with an EXIF rotation.
            upright = ImageOps.exif_transpose(img)
            upright.thumbnail(THUMB_SIZE)
            out = io.BytesIO()
            upright.convert("RGB").save(out, "JPEG", quality=THUMB_QUALITY, optimize=True)
            return out.getvalue()
    except Exception:
        # A PDF, a corrupt upload, or broken EXIF. Pillow raises many error
        # types for bad input, and any of them means the same: no miniature.
        return None


def delete_list_receipts(list_id: str) -> int:
    """Delete every receipt object of a list; return how many were deleted.

    No-op when storage is disabled. The object layout keys receipts by list
    precisely so that this can be a single prefix listing.
    """
    if not is_configured():
        return 0
    blobs = list(_bucket().list_blobs(prefix=f"receipts/{list_id}/"))
    for blob in blobs:
        blob.delete()
    return len(blobs)
