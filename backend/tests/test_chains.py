import importlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.chains.base import ChainProfile
from app.chains.gs1 import check_digit_ok
from app.chains.registry import GENERIC, PROFILES, decode_label, profile_for

CHAINS_DIR = Path(__file__).parent.parent / "app" / "chains"

# (chain folder, vector) for every chain that ships decoders. A chain gains
# vectors by dropping a vectors.json into its folder.
VECTORS = [
    (path.parent.name, vector)
    for path in sorted(CHAINS_DIR.glob("*/vectors.json"))
    for vector in json.loads(path.read_text())
]
_IDS = [f"{chain}:{v['input']}" for chain, v in VECTORS]


def _profile(folder: str) -> ChainProfile:
    return importlib.import_module(f"app.chains.{folder}.profile").PROFILE


@pytest.mark.parametrize(("chain", "vector"), VECTORS, ids=_IDS)
def test_chain_decoder_matches_vectors(chain, vector):
    decoded = _profile(chain).decode_label(vector["input"])
    if vector["expected"] is None:
        assert decoded is None
    else:
        assert decoded is not None
        assert decoded.model_dump(exclude_none=True) == vector["expected"]


_REAL = [(chain, v) for chain, v in VECTORS if v["expected"] is not None]


@pytest.mark.parametrize(("chain", "vector"), _REAL, ids=[f"{c}:{v['input']}" for c, v in _REAL])
def test_without_a_hint_a_real_label_is_read_by_its_chain_only(chain, vector):
    """Every real label is claimed by exactly one chain, so the no-hint path
    accepts it and names the right chain. Negative vectors are per chain: one
    chain's refusal may be another chain's label."""
    decoded = decode_label(vector["input"])
    assert decoded is not None
    assert decoded.chain == _profile(chain).name


def test_hint_runs_only_that_chain_and_its_refusal_is_final():
    mercadona_label = "230035050320600155004972"
    assert decode_label(mercadona_label, "mercadona") is not None
    assert decode_label(mercadona_label, "Ahorramas") is None


def test_a_store_no_chain_claims_counts_as_no_hint():
    """«Mercadona Plaza» has its own key; it must not block every scan."""
    decoded = decode_label("230035050320600155004972", "Mercadona Plaza")
    assert decoded is not None
    assert decoded.chain == "Mercadona"


def test_without_a_hint_a_label_two_chains_read_is_refused(monkeypatch):
    mercadona = profile_for("Mercadona")
    clone = ChainProfile(name="Clone", decoders=mercadona.decoders)
    monkeypatch.setattr("app.chains.registry.PROFILES", (mercadona, clone))
    assert decode_label("230035050320600155004972") is None


def test_check_digit_matches_a_known_ean13():
    assert check_digit_ok("5449000000996")
    assert not check_digit_ok("5449000000997")


def test_profile_for_goes_through_the_store_key():
    assert profile_for("  MERCADONA ").name == "Mercadona"
    assert profile_for("El Corte Ingles").name == "El Corte Inglés"
    assert profile_for("BM").name == "BM Supermercados"
    assert profile_for("Frutería Paco") is GENERIC


def test_no_store_key_is_claimed_by_two_chains():
    keys = [k for p in PROFILES for k in p.store_keys]
    assert len(keys) == len(set(keys))


def test_no_own_brand_belongs_to_two_chains():
    brands = [b for p in PROFILES for b in p.own_brands]
    assert len(brands) == len(set(brands))


def test_own_brands_are_stored_in_lookup_form():
    """The frontend compares a typed brand lowercased and trimmed."""
    for p in PROFILES:
        for brand in p.own_brands:
            assert brand == brand.lower().strip()


def test_get_chains_serves_the_table(client: TestClient):
    res = client.get("/chains")
    assert res.status_code == 200
    assert "max-age" in res.headers["cache-control"]
    mercadona = next(c for c in res.json() if c["name"] == "Mercadona")
    assert mercadona["store_keys"] == ["mercadona"]
    assert "hacendado" in mercadona["own_brands"]


def test_get_chains_says_which_chains_read_a_weight_from_labels(client: TestClient):
    chains = {c["name"]: c for c in client.get("/chains").json()}
    assert chains["Mercadona"]["reads_label_weight"] is True
    # Ahorramas decodes price labels, but they carry no weight.
    assert chains["Ahorramas"]["reads_label_weight"] is False
    assert chains["Carrefour"]["reads_label_weight"] is False


_FOLDERS = sorted(p.parent.name for p in CHAINS_DIR.glob("*/profile.py"))


@pytest.mark.parametrize("folder", _FOLDERS)
def test_reads_label_weight_matches_the_vectors(folder: str):
    """The flag is set by hand, so the vectors keep it honest: a chain that
    claims to read a weight has a weighed vector, and one that does not
    has none."""
    weighed = any(
        v["expected"] is not None and v["expected"].get("weight_g") is not None
        for chain, v in VECTORS
        if chain == folder
    )
    assert _profile(folder).reads_label_weight is weighed


def test_get_label_decodes(client: TestClient):
    res = client.get("/chains/labels/230035050320600155004972", params={"store": "Mercadona"})
    assert res.status_code == 200
    body = res.json()
    assert body["chain"] == "Mercadona"
    assert body["weight_g"] == 3206
    assert body["total_cents"] == 497


def test_get_label_refusal_is_404(client: TestClient):
    res = client.get("/chains/labels/230035050320600155004973")
    assert res.status_code == 404
    assert res.json()["detail"] == "label_not_decoded"


def test_get_label_rejects_non_digits(client: TestClient):
    assert client.get("/chains/labels/23abc").status_code == 422


# A "Bajada de precio" sticker's QR: 0,356 kg at 24,75 €/kg is 8,81.
REDUCED_QR = (
    "https://qrtrack.mercadona.es/01/08436574550801/10/E1016B"
    "?17=261023&16=261021&3103=000356&3922=00881&8005=002475&99=1"
)


def test_get_label_by_code_decodes_a_qr(client: TestClient):
    res = client.get("/chains/labels", params={"code": REDUCED_QR, "store": "Mercadona"})
    assert res.status_code == 200
    body = res.json()
    assert body["chain"] == "Mercadona"
    assert body["format"] == "mercadona-qr"
    assert body["article"] == "08436574550801"
    assert body["reduced"] is True
    assert body["weight_g"] == 356
    assert body["price_per_kg_cents"] == 2475
    assert body["total_cents"] == 881


def test_get_label_by_code_reads_digits_too(client: TestClient):
    res = client.get("/chains/labels", params={"code": "230035050320600155004972"})
    assert res.status_code == 200
    assert res.json()["weight_g"] == 3206


def test_get_label_by_code_refusal_is_404(client: TestClient):
    res = client.get("/chains/labels", params={"code": "https://example.com/x"})
    assert res.status_code == 404
    assert res.json()["detail"] == "label_not_decoded"


def test_get_label_by_code_refuses_a_crafted_code_with_404_not_500(client: TestClient):
    for code in ("23²²²²²²²²²²²", "https://[abc/01/08436574550801"):
        assert client.get("/chains/labels", params={"code": code}).status_code == 404


def test_a_link_with_a_path_prefix_still_reads():
    prefixed = REDUCED_QR.replace("mercadona.es/01/", "mercadona.es/gs1/01/")
    decoded = decode_label(prefixed, "Mercadona")
    assert decoded is not None
    assert decoded.weight_g == 356


def test_the_path_gtin_wins_over_a_query_one():
    decoded = decode_label(REDUCED_QR + "&01=08480000027917", "Mercadona")
    assert decoded is not None
    assert decoded.article == "08436574550801"


def test_a_qr_without_the_reduced_mark_is_not_reduced():
    decoded = decode_label(REDUCED_QR.removesuffix("&99=1"), "Mercadona")
    assert decoded is not None
    assert decoded.reduced is False
