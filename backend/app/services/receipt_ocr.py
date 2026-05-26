from google.cloud import vision
from google.api_core.client_options import ClientOptions

from app.core.config import settings


def extract_text(image_bytes: bytes) -> str:
    """Call Cloud Vision document_text_detection and return full plain text."""
    client_options = ClientOptions(quota_project_id=settings.gcp_project) if settings.gcp_project else None
    client = vision.ImageAnnotatorClient(client_options=client_options)
    image = vision.Image(content=image_bytes)
    response = client.document_text_detection(image=image)
    if response.error.message:
        raise RuntimeError(f"OCR error: {response.error.message}")
    annotation = response.full_text_annotation
    return annotation.text if annotation else ""
