"""GS1 building blocks shared by the chains' label decoders."""

from urllib.parse import parse_qsl, urlsplit

from app.chains.base import LabelDecoder
from app.schemas.chains import DecodedLabel


def is_digits(text: str) -> bool:
    """Only the ASCII digits 0–9. `str.isdigit` also accepts characters
    like «²» that `int` then refuses, and a decoder must refuse, not fail."""
    return text.isascii() and text.isdigit()


def digital_link(code: str) -> tuple[str, dict[str, str]] | None:
    """A GS1 Digital Link URL, as its host and its application identifiers.

    The standard puts the key identifiers in the path, in pairs from the
    GTIN on (`/01/<gtin>/10/<lot>`), after any prefix the host chooses, and
    the rest in the query (`?3103=000356`). The path wins over the query.
    Returns None for anything that is not an https URL with a GTIN.
    """
    try:
        parts = urlsplit(code.strip())
        host = parts.hostname
    except ValueError:  # a malformed host, such as a broken IPv6 one
        return None
    if parts.scheme != "https" or not host:
        return None
    segments = [s for s in parts.path.split("/") if s]
    if "01" not in segments:
        return None
    keyed = segments[segments.index("01") :]
    if len(keyed) % 2:
        return None
    ais = dict(parse_qsl(parts.query))
    ais.update(zip(keyed[::2], keyed[1::2], strict=True))
    if not is_digits(ais["01"]):
        return None
    return host, ais


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
        if len(digits) != 13 or not is_digits(digits) or not digits.startswith(prefix):
            return None
        if not check_digit_ok(digits):
            return None
        return DecodedLabel(
            format="ean13-price",
            article=digits[2:7],
            total_cents=int(digits[7:12]),
        )

    return decode
