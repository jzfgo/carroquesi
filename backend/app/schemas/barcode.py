from pydantic import BaseModel

from app.schemas.items import PackFormat


class BarcodeRead(BaseModel):
    ean: str
    name: str
    brand: str | None
    stores: list[str]  # parsed from comma-separated DB field; [] if None
    # The package size, when Open Food Facts gives a plain one.
    pack: PackFormat | None = None
