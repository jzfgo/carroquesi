"""
Scan all ticket images in tickets/ using Cloud Vision document_text_detection.
Saves OCR output as <image>.ocr.txt next to each image file.
Skips files that already have a corresponding .ocr.txt.

Usage (from repo root):
    uv run python backend/scripts/scan_tickets.py
"""

import os
import sys
from pathlib import Path

from google.cloud import vision
from google.oauth2 import service_account

REPO_ROOT = Path(__file__).resolve().parents[2]
TICKETS_DIR = REPO_ROOT / "tickets"
CREDENTIALS_PATH = REPO_ROOT / "backend" / "carroquesi-firebase-adminsdk-fbsvc-ce362511fb.json"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".webp", ".png", ".avif"}


def make_client() -> vision.ImageAnnotatorClient:
    if CREDENTIALS_PATH.exists():
        creds = service_account.Credentials.from_service_account_file(
            str(CREDENTIALS_PATH),
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        return vision.ImageAnnotatorClient(credentials=creds)
    # Fall back to ADC
    return vision.ImageAnnotatorClient()


def scan_image(client: vision.ImageAnnotatorClient, image_path: Path) -> str:
    image_bytes = image_path.read_bytes()
    image = vision.Image(content=image_bytes)
    response = client.document_text_detection(image=image)
    if response.error.message:
        raise RuntimeError(f"Vision API error: {response.error.message}")
    annotation = response.full_text_annotation
    return annotation.text if annotation else ""


def main() -> None:
    if not TICKETS_DIR.exists():
        print(f"tickets/ dir not found at {TICKETS_DIR}", file=sys.stderr)
        sys.exit(1)

    images = [
        p for p in sorted(TICKETS_DIR.rglob("*"))
        if p.suffix.lower() in SUPPORTED_EXTENSIONS
        and not p.name.startswith("._")
    ]

    if not images:
        print("No ticket images found.")
        return

    client = make_client()
    scanned = 0
    skipped = 0
    errors = 0

    for img_path in images:
        out_path = img_path.with_suffix(img_path.suffix + ".ocr.txt")
        if out_path.exists():
            print(f"  skip  {img_path.relative_to(REPO_ROOT)}")
            skipped += 1
            continue

        print(f"  scan  {img_path.relative_to(REPO_ROOT)} ...", end=" ", flush=True)
        try:
            text = scan_image(client, img_path)
            out_path.write_text(text, encoding="utf-8")
            print(f"→ {len(text)} chars")
            scanned += 1
        except Exception as exc:
            print(f"ERROR: {exc}")
            errors += 1

    print(f"\nDone. scanned={scanned} skipped={skipped} errors={errors}")


if __name__ == "__main__":
    main()
