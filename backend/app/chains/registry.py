from app.chains.ahorramas.profile import PROFILE as AHORRAMAS
from app.chains.alcampo.profile import PROFILE as ALCAMPO
from app.chains.aldi.profile import PROFILE as ALDI
from app.chains.base import ChainProfile
from app.chains.bm.profile import PROFILE as BM
from app.chains.carrefour.profile import PROFILE as CARREFOUR
from app.chains.consum.profile import PROFILE as CONSUM
from app.chains.dia.profile import PROFILE as DIA
from app.chains.e_leclerc.profile import PROFILE as E_LECLERC
from app.chains.el_corte_ingles.profile import PROFILE as EL_CORTE_INGLES
from app.chains.eroski.profile import PROFILE as EROSKI
from app.chains.gadis.profile import PROFILE as GADIS
from app.chains.lidl.profile import PROFILE as LIDL
from app.chains.mercadona.profile import PROFILE as MERCADONA
from app.schemas.chains import ChainRead, LabelRead
from app.services.store_key import store_key

PROFILES: tuple[ChainProfile, ...] = (
    MERCADONA,
    CARREFOUR,
    LIDL,
    ALDI,
    DIA,
    AHORRAMAS,
    ALCAMPO,
    EROSKI,
    EL_CORTE_INGLES,
    GADIS,
    CONSUM,
    BM,
    E_LECLERC,
)

# A store no profile claims: no own brands, no label decoders.
GENERIC = ChainProfile(name="")

_BY_KEY = {key: profile for profile in PROFILES for key in profile.store_keys}


def chain_table() -> list[ChainRead]:
    """The chain data clients get as data, never as logic."""
    return [
        ChainRead(
            name=p.name,
            store_keys=list(p.store_keys),
            own_brands=list(p.own_brands),
            reads_label_weight=p.reads_label_weight,
        )
        for p in PROFILES
    ]


def profile_for(store: str) -> ChainProfile:
    return _BY_KEY.get(store_key(store), GENERIC)


def decode_label(code: str, store: str | None = None) -> LabelRead | None:
    """Decode an in-store label, or refuse. `code` is what the camera read:
    a barcode's digits or a QR's text.

    With a known chain's store, only that chain's decoders run, and their
    refusal is final: prefix 23 means one thing at Mercadona and may mean
    another elsewhere. A store no chain claims says nothing about the
    format, so it counts as no store. Without one, a label is accepted only
    when exactly one chain reads it, so a code two chains could claim is
    refused, not guessed.
    """
    hinted = profile_for(store) if store is not None else GENERIC
    candidates = (hinted,) if hinted is not GENERIC else PROFILES
    reads = [
        LabelRead(chain=profile.name, **decoded.model_dump())
        for profile in candidates
        if (decoded := profile.decode_label(code)) is not None
    ]
    return reads[0] if len(reads) == 1 else None
