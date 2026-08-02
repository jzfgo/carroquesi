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

from datetime import timedelta
from pathlib import Path

from google.cloud import storage

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
