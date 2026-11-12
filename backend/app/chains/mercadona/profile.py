from decimal import ROUND_HALF_UP, Decimal

from app.chains.base import ChainProfile
from app.chains.gs1 import check_digit_ok, digital_link, ean13_price, is_digits
from app.schemas.chains import DecodedLabel

QR_HOST = "qrtrack.mercadona.es"


def _adds_up(weight_g: int, price_per_kg_cents: int, total_cents: int) -> bool:
    """The label's total is its weight times its €/kg, rounded half up."""
    expected = (Decimal(weight_g * price_per_kg_cents) / 1000).quantize(
        Decimal(1), rounding=ROUND_HALF_UP
    )
    return expected == total_cents


def decode_weighed_qr(code: str) -> DecodedLabel | None:
    """The QR on a weighed label, a GS1 Digital Link on Mercadona's host.
    The "Bajada de precio" sticker carries only this QR; its 24 digits are
    printed text, with no barcode.

    `01` is the product's GTIN, which stands in for the article code. The
    query holds the weight in kg with 3 decimals (`3103`), the total in cents
    (`3922`), and the €/kg in cents (`8005`). `99=1` marks the price as
    reduced: every reduced sticker seen carries it.

    Validated like the 24 digits: the GTIN's check digit and the arithmetic.
    """
    link = digital_link(code)
    if link is None or link[0] != QR_HOST:
        return None
    ais = link[1]
    gtin, weight, total, per_kg = ais["01"], ais.get("3103"), ais.get("3922"), ais.get("8005")
    if len(gtin) != 14 or not check_digit_ok(gtin):
        return None
    if not (weight and total and per_kg and is_digits(weight + total + per_kg)):
        return None
    weight_g, total_cents, price_per_kg_cents = int(weight), int(total), int(per_kg)
    if not _adds_up(weight_g, price_per_kg_cents, total_cents):
        return None
    return DecodedLabel(
        format="mercadona-qr",
        article=gtin,
        reduced=ais.get("99") == "1",
        weight_g=weight_g,
        price_per_kg_cents=price_per_kg_cents,
        total_cents=total_cents,
    )


def decode_weighed_24(digits: str) -> DecodedLabel | None:
    """The 24-digit weighed-goods label (cut fruit, "Bajada de precio"):

    23 | reduced (0/1) | article (5) | grams (5) | €/kg cents (5) | total cents (5) | check

    A private format that can change without notice, so a label must pass
    both the check digit and the arithmetic. A wrong decode records a wrong
    price; a refusal costs only a manual entry.
    """
    if len(digits) != 24 or not is_digits(digits) or digits[:2] != "23" or digits[2] not in "01":
        return None
    if not check_digit_ok(digits):
        return None
    weight_g = int(digits[8:13])
    price_per_kg_cents = int(digits[13:18])
    total_cents = int(digits[18:23])
    if not _adds_up(weight_g, price_per_kg_cents, total_cents):
        return None
    return DecodedLabel(
        format="mercadona-24",
        article=digits[3:8],
        reduced=digits[2] == "1",
        weight_g=weight_g,
        price_per_kg_cents=price_per_kg_cents,
        total_cents=total_cents,
    )


PROFILE = ChainProfile(
    name="Mercadona",
    own_brands=("hacendado", "bosque verde", "deliplus baby", "deliplus", "compy"),
    decoders=(decode_weighed_24, decode_weighed_qr, ean13_price("23")),
    reads_label_weight=True,
)
