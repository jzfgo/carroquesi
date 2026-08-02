from pydantic import BaseModel


class BarcodeRead(BaseModel):
    ean: str
    name: str
    brand: str | None
    stores: list[str]  # parsed from comma-separated DB field; [] if None
