from google.cloud import vision


def extract_text(image_bytes: bytes) -> str:
    """Call Cloud Vision document_text_detection and return full plain text."""
    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)
    response = client.document_text_detection(image=image)
    if response.error.message:
        raise RuntimeError(f"OCR error: {response.error.message}")
    annotation = response.full_text_annotation
    return annotation.text if annotation else ""
