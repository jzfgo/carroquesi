from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, Response

from app.chains.registry import chain_table, decode_label
from app.dependencies import CurrentUser
from app.schemas.chains import ChainRead, LabelRead

router = APIRouter(prefix="/chains", tags=["chains"])

# The table changes only with a deploy, and a stale copy is harmless: it
# can only miss a brand added since.
_CHAINS_CACHE_CONTROL = "private, max-age=86400"


@router.get("", response_model=list[ChainRead])
def get_chains(current_user: CurrentUser, response: Response) -> list[ChainRead]:
    response.headers["Cache-Control"] = _CHAINS_CACHE_CONTROL
    return chain_table()


@router.get(
    "/labels/{digits}",
    response_model=LabelRead,
    responses={404: {"description": "label_not_decoded"}},
)
def get_label(
    digits: Annotated[str, Path(pattern=r"^\d+$", max_length=32)],
    current_user: CurrentUser,
    store: Annotated[str | None, Query(min_length=1)] = None,
) -> LabelRead:
    """Decode an in-store label's barcode. `store` is the one store the scan
    is tied to, if any; with it, only that chain's decoders run."""
    decoded = decode_label(digits, store)
    if decoded is None:
        raise HTTPException(status_code=404, detail="label_not_decoded")
    return decoded
