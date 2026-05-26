import time
from google.cloud import storage as gcs

from app.core.config import settings


def store_image(image_bytes: bytes, user_id: str) -> str | None:
    """Upload image to object storage. Returns the storage path, or None if storage is not configured."""
    if not settings.receipt_storage_bucket:
        return None
    client = gcs.Client(project=settings.gcp_project or None)
    bucket = client.bucket(settings.receipt_storage_bucket)
    path = f"receipts/{user_id}/{int(time.time() * 1000)}.jpg"
    blob = bucket.blob(path)
    blob.upload_from_string(image_bytes, content_type="image/jpeg")
    return path
