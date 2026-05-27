"""
Tests for new store parsers using real Cloud Vision OCR fixtures.
Each fixture is actual OCR output from tickets/; see backend/tests/fixtures/receipts/.
"""
import pytest
from pathlib import Path
from app.services.receipt_parser import parse_receipt

FIXTURES = Path(__file__).parent / "fixtures" / "receipts"


def _ocr(store: str, filename: str) -> str:
    return (FIXTURES / store / filename).read_text(encoding="utf-8")


# ── Alcampo ───────────────────────────────────────────────────────────────────

def test_alcampo_store_detected():
    result = parse_receipt(_ocr("alcampo", "alcampo_esplugues_74.txt"))
    assert result.store == "Alcampo"


def test_alcampo_items_parsed():
    result = parse_receipt(_ocr("alcampo", "alcampo_esplugues_74.txt"))
    names = [l.name for l in result.lines]
    assert any("KIKKOMAN" in n for n in names)
    assert any("HARINA" in n for n in names)
    assert any("MANTEQUILLA" in n for n in names)


def test_alcampo_total_detected():
    result = parse_receipt(_ocr("alcampo", "alcampo_esplugues_74.txt"))
    assert result.receipt_total == pytest.approx(74.71)


def test_alcampo_non_items_excluded():
    result = parse_receipt(_ocr("alcampo", "alcampo_esplugues_74.txt"))
    names = [l.name for l in result.lines]
    assert not any("TARJETA" in n.upper() for n in names)
    assert not any("FACTURA" in n.upper() for n in names)


# ── Aldi ──────────────────────────────────────────────────────────────────────

def test_aldi_store_detected():
    result = parse_receipt(_ocr("aldi", "aldi_valencia_108.txt"))
    assert result.store == "Aldi"


def test_aldi_items_parsed():
    result = parse_receipt(_ocr("aldi", "aldi_valencia_108.txt"))
    names = [l.name for l in result.lines]
    assert any("BONITO" in n for n in names)
    assert any("SAN MIGUEL" in n for n in names)
    assert any("PECHUGA" in n for n in names)


def test_aldi_total_detected():
    result = parse_receipt(_ocr("aldi", "aldi_valencia_108.txt"))
    assert result.receipt_total == pytest.approx(108.44)


def test_aldi_weight_item():
    result = parse_receipt(_ocr("aldi", "aldi_valencia_108.txt"))
    # LONGANIZA DE POLLO has a kg line
    longaniza = next((l for l in result.lines if "LONGANIZA" in l.name), None)
    assert longaniza is not None
    assert longaniza.price_per == "KILOGRAM"


# ── Caprabo ───────────────────────────────────────────────────────────────────

def test_caprabo_store_detected():
    result = parse_receipt(_ocr("caprabo", "caprabo_diagonal_8.txt"))
    assert result.store == "Caprabo"


def test_caprabo_items_parsed():
    result = parse_receipt(_ocr("caprabo", "caprabo_diagonal_8.txt"))
    names = [l.name for l in result.lines]
    assert any("PIT GALL" in n or "GALL DINDI" in n for n in names)
    assert any("FORMATGE" in n or "MAKI" in n for n in names)


def test_caprabo_total_detected():
    result = parse_receipt(_ocr("caprabo", "caprabo_diagonal_8.txt"))
    assert result.receipt_total == pytest.approx(8.81)


# ── Carrefour ─────────────────────────────────────────────────────────────────

def test_carrefour_store_detected():
    result = parse_receipt(_ocr("carrefour", "carrefour_alicante_35.txt"))
    assert result.store == "Carrefour"


def test_carrefour_items_parsed():
    result = parse_receipt(_ocr("carrefour", "carrefour_alicante_35.txt"))
    names = [l.name for l in result.lines]
    assert any("CEREALES" in n for n in names)
    assert any("QUESO" in n for n in names)
    assert any("PIÑA" in n or "PI" in n for n in names)


def test_carrefour_total_detected():
    result = parse_receipt(_ocr("carrefour", "carrefour_alicante_35.txt"))
    assert result.receipt_total == pytest.approx(35.10)


def test_carrefour_non_items_excluded():
    result = parse_receipt(_ocr("carrefour", "carrefour_alicante_35.txt"))
    names = [l.name for l in result.lines]
    assert not any("VENTAJAS" in n.upper() for n in names)
    assert not any("CUOTA" in n.upper() for n in names)


# ── Consum ────────────────────────────────────────────────────────────────────

def test_consum_store_detected():
    result = parse_receipt(_ocr("consum", "consum_43.txt"))
    assert result.store == "Consum"


def test_consum_items_parsed():
    result = parse_receipt(_ocr("consum", "consum_43.txt"))
    names = [l.name for l in result.lines]
    assert any("TOMATE" in n for n in names)
    assert any("PECHUGA" in n for n in names)
    assert any("PIZZA" in n for n in names)


def test_consum_total_detected():
    result = parse_receipt(_ocr("consum", "consum_43.txt"))
    assert result.receipt_total == pytest.approx(43.38)


def test_consum_non_items_excluded():
    result = parse_receipt(_ocr("consum", "consum_43.txt"))
    names = [l.name for l in result.lines]
    assert not any("TARJ" in n.upper() for n in names)
    assert not any("CAMBIO" in n.upper() for n in names)


# ── Dia ───────────────────────────────────────────────────────────────────────

def test_dia_store_detected():
    result = parse_receipt(_ocr("dia", "dia_42.txt"))
    assert result.store == "Dia"


def test_dia_items_parsed():
    result = parse_receipt(_ocr("dia", "dia_42.txt"))
    names = [l.name for l in result.lines]
    assert any("LECHE" in n for n in names)
    assert any("SAL" in n for n in names)  # SALMÓN / LOMOS SALMÓN
    assert any("PECHUGA" in n for n in names)


def test_dia_total_detected():
    result = parse_receipt(_ocr("dia", "dia_42.txt"))
    assert result.receipt_total == pytest.approx(42.08)


def test_dia_offers_excluded():
    result = parse_receipt(_ocr("dia", "dia_42.txt"))
    names = [l.name for l in result.lines]
    assert not any("JAMON SERRANO N.ALAC" in n for n in names)  # discount line


# ── El Corte Inglés ───────────────────────────────────────────────────────────

def test_eci_store_detected():
    result = parse_receipt(_ocr("eci", "eci_22.txt"))
    assert result.store == "El Corte Inglés"


def test_eci_items_parsed():
    result = parse_receipt(_ocr("eci", "eci_22.txt"))
    names = [l.name for l in result.lines]
    assert any("ZUMO" in n for n in names)
    assert any("MIEL" in n for n in names)


def test_eci_total_detected():
    result = parse_receipt(_ocr("eci", "eci_22.txt"))
    assert result.receipt_total == pytest.approx(22.96)


def test_eci_non_items_excluded():
    result = parse_receipt(_ocr("eci", "eci_22.txt"))
    names = [l.name for l in result.lines]
    assert not any("VISA" in n.upper() for n in names)
    assert not any("SUBTOTAL" in n.upper() for n in names)


# ── Eroski ────────────────────────────────────────────────────────────────────

def test_eroski_store_detected():
    result = parse_receipt(_ocr("eroski", "eroski_8.txt"))
    assert result.store == "Eroski"


def test_eroski_items_parsed():
    result = parse_receipt(_ocr("eroski", "eroski_8.txt"))
    names = [l.name for l in result.lines]
    assert any("NECTARINA" in n for n in names)
    assert any("SALMON" in n for n in names)
    assert any("BASTONCILLOS" in n for n in names)


def test_eroski_total_detected():
    result = parse_receipt(_ocr("eroski", "eroski_8.txt"))
    assert result.receipt_total == pytest.approx(8.28)


# ── Gadis ─────────────────────────────────────────────────────────────────────

def test_gadis_store_detected():
    result = parse_receipt(_ocr("gadis", "gadis_vigo_20.txt"))
    assert result.store == "Gadis"


def test_gadis_items_parsed():
    result = parse_receipt(_ocr("gadis", "gadis_vigo_20.txt"))
    names = [l.name for l in result.lines]
    assert any("MEJ" in n for n in names)  # MEJILLONES
    assert any("LECHUGA" in n for n in names)
    assert any("NARANJA" in n or "BRECOL" in n for n in names)


def test_gadis_total_detected():
    result = parse_receipt(_ocr("gadis", "gadis_vigo_20.txt"))
    assert result.receipt_total == pytest.approx(20.12)


# ── HiperDino ─────────────────────────────────────────────────────────────────

def test_hiperdino_store_detected():
    result = parse_receipt(_ocr("hiperdino", "hiperdino_31.txt"))
    assert result.store == "HiperDino"


def test_hiperdino_items_parsed():
    result = parse_receipt(_ocr("hiperdino", "hiperdino_31.txt"))
    names = [l.name for l in result.lines]
    assert any("HUEVO" in n for n in names)
    assert any("QUESO" in n for n in names)


def test_hiperdino_total_detected():
    result = parse_receipt(_ocr("hiperdino", "hiperdino_31.txt"))
    assert result.receipt_total == pytest.approx(31.58)


def test_hiperdino_non_items_excluded():
    result = parse_receipt(_ocr("hiperdino", "hiperdino_31.txt"))
    names = [l.name for l in result.lines]
    assert not any("DINOSOL" in n.upper() for n in names)


# ── Lidl ──────────────────────────────────────────────────────────────────────

def test_lidl_store_detected():
    result = parse_receipt(_ocr("lidl", "lidl_bcn_42.txt"))
    assert result.store == "Lidl"


def test_lidl_items_parsed():
    result = parse_receipt(_ocr("lidl", "lidl_bcn_42.txt"))
    names = [l.name for l in result.lines]
    assert any("COGOMBRETS" in n or "QUARK" in n for n in names)
    assert any("MOZZARELLA" in n for n in names)
    assert any("PICADA" in n or "BOVI" in n or "BOVÍ" in n for n in names)


def test_lidl_total_detected():
    result = parse_receipt(_ocr("lidl", "lidl_bcn_42.txt"))
    assert result.receipt_total == pytest.approx(42.91)


def test_lidl_discounts_excluded():
    result = parse_receipt(_ocr("lidl", "lidl_bcn_42.txt"))
    # Discounts ("Desc.", "-0,30") must not appear as items
    assert all(l.price > 0 for l in result.lines)


def test_lidl_weight_item():
    result = parse_receipt(_ocr("lidl", "lidl_bcn_42.txt"))
    # No kg items in this fixture, but discount lines must not corrupt other items
    names = [l.name for l in result.lines]
    assert not any("Desc" in n for n in names)


# ── Primaprix ─────────────────────────────────────────────────────────────────

def test_primaprix_store_detected():
    result = parse_receipt(_ocr("primaprix", "primaprix_0.txt"))
    assert result.store == "Primaprix"


def test_primaprix_items_parsed():
    result = parse_receipt(_ocr("primaprix", "primaprix_0.txt"))
    names = [l.name for l in result.lines]
    assert any("PAN" in n for n in names)


def test_primaprix_total_detected():
    result = parse_receipt(_ocr("primaprix", "primaprix_0.txt"))
    assert result.receipt_total == pytest.approx(0.70)


# ── Sqrups ────────────────────────────────────────────────────────────────────

def test_sqrups_store_detected():
    result = parse_receipt(_ocr("sqrups", "sqrups_1.txt"))
    assert result.store == "Sqrups"


def test_sqrups_items_parsed():
    result = parse_receipt(_ocr("sqrups", "sqrups_1.txt"))
    names = [l.name for l in result.lines]
    assert any("FANTA" in n for n in names)
    assert any("LUX" in n for n in names)


def test_sqrups_total_detected():
    result = parse_receipt(_ocr("sqrups", "sqrups_1.txt"))
    assert result.receipt_total == pytest.approx(1.95)


def test_sqrups_discounts_excluded():
    result = parse_receipt(_ocr("sqrups", "sqrups_1.txt"))
    assert all(l.price > 0 for l in result.lines)


# ── Supeco ────────────────────────────────────────────────────────────────────

def test_supeco_store_detected():
    result = parse_receipt(_ocr("supeco", "supeco_48.txt"))
    assert result.store == "Supeco"


def test_supeco_items_parsed():
    result = parse_receipt(_ocr("supeco", "supeco_48.txt"))
    names = [l.name for l in result.lines]
    assert any("LIMPIADOR" in n for n in names)
    assert any("CACAO" in n for n in names)
    assert any("QUESO" in n for n in names)


def test_supeco_total_detected():
    result = parse_receipt(_ocr("supeco", "supeco_48.txt"))
    assert result.receipt_total == pytest.approx(48.05)


def test_supeco_non_items_excluded():
    result = parse_receipt(_ocr("supeco", "supeco_48.txt"))
    names = [l.name for l in result.lines]
    assert not any("TIPO" in n.upper() for n in names)
    assert not any("CUOTA" in n.upper() for n in names)
