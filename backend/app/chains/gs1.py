"""GS1 building blocks shared by the chains' label decoders."""

from urllib.parse import parse_qsl, urlsplit

from app.chains.base import LabelDecoder
from app.schemas.chains import DecodedLabel


def digital_link(code: str) -> tuple[str, dict[str, str]] | None:
    """A GS1 Digital Link URL, as its host and its application identifiers.

    The standard puts the key identifiers in the path, in pairs
    (`/01/<gtin>/10/<lot>`), and the rest in the query (`?3103=000356`).
    Returns None for anything that is not an https URL with a GTIN.
    """
    parts = urlsplit(code.strip())
    if parts.scheme != "https" or not parts.hostname:
        return None
    segments = [s for s in parts.path.split("/") if s]
    if len(segments) % 2:
        return None
    ais = dict(zip(segments[::2], segments[1::2], strict=True))
    ais.update(parse_qsl(parts.query))
    if not ais.get("01", "").isdigit():
        return None
    return parts.hostname, ais


def check_digit_ok(digits: str) -> bool:
    """GS1 mod-10: weights 3 and 1 alternate leftwards from the last data
    digit. Works for any length, so it covers EAN-13 and longer labels."""
    *body, check = (int(d) for d in digits)
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def ean13_price(prefix: str) -> LabelDecoder:
    """An in-store EAN-13 that carries the price: prefix (2 digits), article
    (5), price in cents (5), check digit. The prefix is one of the 20–29
    in-store range, and each chain uses its own."""

    def decode(digits: str) -> DecodedLabel | None:
        if len(digits) != 13 or not digits.isdigit() or not digits.startswith(prefix):
            return None
        if not check_digit_ok(digits):
            return None
        return DecodedLabel(
            format="ean13-price",
            article=digits[2:7],
            total_cents=int(digits[7:12]),
        )

    return decode
