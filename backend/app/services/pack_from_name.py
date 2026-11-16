"""Reads a pack format out of what someone typed: «Agua 6x1,5L» is
«Agua» in packs of 6 × 1,5 L.

A guess only counts when it is plain. A name with two sizes, a figure
grouped in thousands, or nothing left once the format is taken out is left
alone: a wrong format skews every €/L the product shows, and an empty one
costs nothing.
"""

import re

from pydantic import ValidationError

from app.db.models import ListItem, pack_columns
from app.schemas.items import ContentUnit, PackFormat

_NUM = r"\d+(?:[.,]\d+)?"
_UNIT = r"kgs?|kilos?|grs?|gramos?|g|ml|cl|dl|lts?|litros?|l"
# Not glued to a letter or another figure: «B12» is a vitamin, not a size.
_START = r"(?<![\w.,])"

_UNITS: dict[str, ContentUnit] = {
    "kg": "kg",
    "kgs": "kg",
    "kilo": "kg",
    "kilos": "kg",
    "g": "g",
    "gr": "g",
    "grs": "g",
    "gramo": "g",
    "gramos": "g",
    "ml": "ml",
    "cl": "cl",
    "dl": "dl",
    "l": "l",
    "lt": "l",
    "lts": "l",
    "litro": "l",
    "litros": "l",
}

# «6x1,5L», «pack de 6 x 33 cl»: count and content in one expression.
_COUNT_AND_CONTENT = re.compile(
    rf"{_START}(?:pack\s*(?:de\s*)?)?(\d+)\s*[x×]\s*({_NUM})\s*({_UNIT})\.?(?!\w)",
    re.IGNORECASE,
)
_CONTENT = re.compile(rf"{_START}({_NUM})\s*({_UNIT})\.?(?!\w)", re.IGNORECASE)
# «x 18» after a figure is a size («18 x 18 cm»), not a count. The lookbehind
# sees one space only, so the parse first turns any run of spaces into one.
_COUNT = re.compile(
    rf"(?:\bpack\s*(?:de\s*)?(\d+)|{_START}(\d+)\s*(?:uds?|unidades)\.?|(?<!\w)(?<!\d\s)x\s*(\d+))(?!\w)",
    re.IGNORECASE,
)

# What a format leaves behind once taken out: «Agua de», «Agua -», «Agua ()»,
# «Tomate (bandeja )».
_EMPTY_BRACKETS = re.compile(r"\(\s*\)|\[\s*\]")
# Spaces just inside a bracket: «(bandeja )» becomes «(bandeja)».
_INNER_SPACE = re.compile(r"(?<=[(\[])\s+|\s+(?=[)\]])")
_DANGLING_WORDS = ("de", "en", "x")
_DANGLING_MARKS = "-–·,:/"

# Longer than any product name. Names are free text, so the parse is not
# run on a long one at all, whatever its patterns cost.
_MAX_NAME = 200

# «1.000» is a thousand in Spanish: refused rather than read as one.
_THOUSANDS = re.compile(r"^[1-9]\d{0,2}\.\d{3}$")


def _pack(count: int, content: str | None, unit: str | None) -> dict | None:
    """The format as the API holds it, or None when out of its bounds."""
    if content is not None and _THOUSANDS.match(content):
        return None
    try:
        pack = PackFormat(
            count=count,
            content=float(content.replace(",", ".")) if content else None,
            unit=_UNITS[unit.lower()] if unit else None,
        )
    except ValidationError:
        return None
    return pack.model_dump()


def _clean(name: str) -> str:
    name = _EMPTY_BRACKETS.sub(" ", name)
    name = _INNER_SPACE.sub("", name)
    name = re.sub(r"\s+", " ", name).strip()
    # Word by word from the end, with no backtracking regex. Each step
    # slices, so the name cap is what bounds the cost.
    while name:
        if name[-1] in _DANGLING_MARKS:
            name = name[:-1].rstrip()
            continue
        head, _, last = name.rpartition(" ")
        if head and last.lower() in _DANGLING_WORDS:
            name = head.rstrip()
            continue
        break
    return name


def _spans(pattern: re.Pattern[str], text: str) -> list[re.Match[str]]:
    return list(pattern.finditer(text))


def _blank(text: str, match: re.Match[str]) -> str:
    """Takes a match out, keeping the other offsets where they were."""
    return text[: match.start()] + " " * (match.end() - match.start()) + text[match.end() :]


def format_in_name(name: str) -> tuple[str, dict] | None:
    """The name without its format, and the format, when the name carries
    exactly one. None otherwise."""
    if len(name) > _MAX_NAME:
        return None
    rest = re.sub(r"\s+", " ", name)
    both = _spans(_COUNT_AND_CONTENT, rest)
    for m in both:
        rest = _blank(rest, m)
    contents = _spans(_CONTENT, rest)
    for m in contents:
        rest = _blank(rest, m)
    counts = _spans(_COUNT, rest)
    for m in counts:
        rest = _blank(rest, m)

    if both:
        if len(both) > 1 or contents or counts:
            return None
        count, content, unit = int(both[0][1]), both[0][2], both[0][3]
    else:
        if len(contents) > 1 or len(counts) > 1 or not (contents or counts):
            return None
        count = int(next(g for g in counts[0].groups() if g)) if counts else 1
        content, unit = (contents[0][1], contents[0][2]) if contents else (None, None)

    pack = _pack(count, content, unit)
    stripped = _clean(rest)
    if pack is None or not re.search(r"[^\W\d_]", stripped):
        return None
    return stripped, pack


def name_without_format(name: str) -> str:
    """The name as it is saved once its format is taken out, for comparing
    a name written before that with one written after."""
    found = format_in_name(name)
    return found[0] if found else name


def format_in_quantity(quantity: str | None) -> dict | None:
    """The package size a quantity names, when that is all it says: «1,5 L»
    or «6x1L». A count, or a size with more text, is not a format."""
    if not quantity:
        return None
    text = quantity.strip()
    m = _COUNT_AND_CONTENT.fullmatch(text)
    if m:
        return _pack(int(m[1]), m[2], m[3])
    m = _CONTENT.fullmatch(text)
    if m:
        return _pack(1, m[1], m[2])
    return None


def fill_from_receipt(item: ListItem, pack: dict | None) -> None:
    """Gives a line with no format the one its receipt line printed. Any
    format the line already has, typed or read from its name, stays: the
    receipt's abbreviated text is the weaker read."""
    if pack is None or item.pack is not None:
        return
    for column, value in pack_columns(pack).items():
        setattr(item, column, value)
    item.pack_source = "receipt"


def fill_from_off(item: ListItem, quantity: str | None) -> None:
    """Gives a line with no format the package size Open Food Facts gives
    for its EAN, when that size is plain: «1,5 l», «6 x 33 cl». «℮» only
    says the size is an average, so it is dropped first."""
    if item.pack is not None:
        return
    pack = format_in_quantity((quantity or "").replace("℮", ""))
    if pack is None:
        return
    for column, value in pack_columns(pack).items():
        setattr(item, column, value)
    item.pack_source = "off"


def fill_from_name(item: ListItem) -> None:
    """Gives a line with no format, or one guessed before, the format its
    name carries, and takes it out of the name. A format someone typed is
    never replaced."""
    if item.pack is not None and item.pack_source not in ("name", "receipt", "off", "copied"):
        return
    found = format_in_name(item.name)
    if found is None:
        return
    item.name, pack = found
    for column, value in pack_columns(pack).items():
        setattr(item, column, value)
    item.pack_source = "name"
