from app.chains.base import ChainProfile
from app.chains.gs1 import ean13_price

PROFILE = ChainProfile(
    name="Ahorramas",
    own_brands=("alipende", "lanta", "bodyplus", "meque"),
    decoders=(ean13_price("21"),),
)
