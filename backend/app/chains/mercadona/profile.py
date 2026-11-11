from decimal import ROUND_HALF_UP, Decimal

from app.chains.base import ChainProfile
from app.chains.gs1 import check_digit_ok, ean13_price
from app.schemas.chains import DecodedLabel


def decode_weighed_24(digits: str) -> DecodedLabel | None:
    """The 24-digit weighed-goods label (cut fruit, "Bajada de precio"):

    23 | reduced (0/1) | article (5) | grams (5) | €/kg cents (5) | total cents (5) | check

    A private format that can change without notice, so a label must pass
    both the check digit and the arithmetic. A wrong decode records a wrong
    price; a refusal costs only a manual entry.
    """
    if len(digits) != 24 or not digits.isdigit() or digits[:2] != "23" or digits[2] not in "01":
        return None
    if not check_digit_ok(digits):
        return None
    weight_g = int(digits[8:13])
    price_per_kg_cents = int(digits[13:18])
    total_cents = int(digits[18:23])
    expected = (Decimal(weight_g * price_per_kg_cents) / 1000).quantize(
        Decimal(1), rounding=ROUND_HALF_UP
    )
    if expected != total_cents:
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
    decoders=(decode_weighed_24, ean13_price("23")),
    reads_label_weight=True,
)
