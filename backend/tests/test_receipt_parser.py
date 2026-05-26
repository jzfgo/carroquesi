import pytest
from app.services.receipt_parser import parse_receipt, ParsedLine, ParsedReceipt


MERCADONA_OCR = """MERCADONA, S.A.
C/ EJEMPLO 1, MADRID
11/04/2026 15:57

Descripcion           Importe
BEBIDA ALMENDRAS 0%      1,15
QUESO GOUDA LONCHAS      2,15
BACON LONCHAS            5,29
   2,3 kg x 2,30 EUR/kg
2 BOLSA PLASTICO         0,30
MANI DULCE               3,15

TOTAL                   12,04
Tarjeta bancaria        12,04
IVA  10%  base  10,00   1,04
"""

# Realistic Cloud Vision output for Mercadona: names and prices in separate columns
MERCADONA_COLUMNAR_OCR = """MERCADONA, S.A.
A-46103834
C/ VILLA DE ARBANCÓN, 4
28005 MADRID
25/05/2026 19:48 OP:2166626
FACTURA SIMPLIFICADA: 2710-011-930615
Descripción
2 BEBIDA ALMENDRAS 0%
1 SANDIA PARTIDA B/S
1 PECHUGA FINAS HIERB.
1 FILETE PLANCHA
1 BURGER VACUNO
P. Unit Imp.(€)
TOTAL (€)
TARJETA BANCARIA
1,15
2,30
3,14
4,16
7,38
32,95
"""

# Realistic Cloud Vision output for Ahorramas: name / tax class / price on separate lines
AHORRAMAS_OCR = """AHORRaMas
PASEO DE LAS ACACIAS, 24
28005 MADRID
2026-04-22 19:59:50 Caja: 6 Tique: 174
LECHE ENTERA 1L C
1,25€
PAN DE MOLDE
B
1,25€
ACEITE OLIVA 1L
A
4,50€
TOTAL
7,00€
"""

GENERIC_OCR = """SUPERMERCADO BM
Calle Mayor 5

Yogur natural    0,75
Mantequilla      1,30
Cereales muesli  2,45

Total            4,50
"""


# ── Mercadona (combined-line format) ────────────────────────────────────────

def test_mercadona_store_detected():
    result = parse_receipt(MERCADONA_OCR)
    assert result.store == "Mercadona"


def test_mercadona_date_detected():
    result = parse_receipt(MERCADONA_OCR)
    from datetime import date
    assert result.receipt_date == date(2026, 4, 11)


def test_mercadona_total_detected():
    result = parse_receipt(MERCADONA_OCR)
    assert result.receipt_total == pytest.approx(12.04)


def test_mercadona_items_parsed():
    result = parse_receipt(MERCADONA_OCR)
    names = [l.name for l in result.lines]
    assert "BEBIDA ALMENDRAS 0%" in names
    assert "QUESO GOUDA LONCHAS" in names
    assert "MANI DULCE" in names


def test_mercadona_non_items_excluded():
    result = parse_receipt(MERCADONA_OCR)
    names = [l.name for l in result.lines]
    assert not any("TOTAL" in n for n in names)
    assert not any("IVA" in n for n in names)
    assert not any("Tarjeta" in n for n in names)


def test_mercadona_weight_item():
    result = parse_receipt(MERCADONA_OCR)
    bacon = next(l for l in result.lines if "BACON" in l.name)
    assert bacon.price_per == "KILOGRAM"
    assert bacon.price == pytest.approx(2.30)


def test_mercadona_quantity_prefix_stripped():
    result = parse_receipt(MERCADONA_OCR)
    bolsa = next(l for l in result.lines if "BOLSA" in l.name)
    assert bolsa.name == "2 BOLSA PLASTICO"


# ── Mercadona (columnar Cloud Vision format) ─────────────────────────────────

def test_mercadona_columnar_items_parsed():
    result = parse_receipt(MERCADONA_COLUMNAR_OCR)
    names = [l.name for l in result.lines]
    assert any("BEBIDA" in n for n in names)
    assert any("SANDIA" in n for n in names)
    assert any("PECHUGA" in n for n in names)


def test_mercadona_columnar_prices_paired():
    result = parse_receipt(MERCADONA_COLUMNAR_OCR)
    bebida = next((l for l in result.lines if "BEBIDA" in l.name), None)
    assert bebida is not None
    assert bebida.price == pytest.approx(1.15)


def test_mercadona_columnar_non_items_excluded():
    result = parse_receipt(MERCADONA_COLUMNAR_OCR)
    names = [l.name for l in result.lines]
    assert not any("TARJETA" in n.upper() for n in names)
    assert not any("P. Unit" in n for n in names)


# ── Ahorramas ────────────────────────────────────────────────────────────────

def test_ahorramas_store_detected():
    result = parse_receipt(AHORRAMAS_OCR)
    assert result.store == "Ahorramas"


def test_ahorramas_items_parsed():
    result = parse_receipt(AHORRAMAS_OCR)
    names = [l.name for l in result.lines]
    assert "LECHE ENTERA 1L" in names
    assert "PAN DE MOLDE" in names
    assert "ACEITE OLIVA 1L" in names


def test_ahorramas_tax_class_stripped():
    result = parse_receipt(AHORRAMAS_OCR)
    names = [l.name for l in result.lines]
    # Tax class letters must not appear as standalone items
    assert not any(n in ("A", "B", "C") for n in names)
    # Tax letter should not be appended to name
    assert "LECHE ENTERA 1L" in names
    assert not any(n.endswith(" C") for n in names)


def test_ahorramas_prices_correct():
    result = parse_receipt(AHORRAMAS_OCR)
    leche = next(l for l in result.lines if "LECHE" in l.name)
    assert leche.price == pytest.approx(1.25)
    pan = next(l for l in result.lines if "PAN" in l.name)
    assert pan.price == pytest.approx(1.25)


def test_ahorramas_total_detected():
    result = parse_receipt(AHORRAMAS_OCR)
    assert result.receipt_total == pytest.approx(7.0)


def test_ahorramas_non_items_excluded():
    result = parse_receipt(AHORRAMAS_OCR)
    names = [l.name for l in result.lines]
    assert not any("TOTAL" in n for n in names)


# ── Generic fallback ─────────────────────────────────────────────────────────

def test_generic_fallback_items_parsed():
    result = parse_receipt(GENERIC_OCR)
    names = [l.name for l in result.lines]
    assert "Yogur natural" in names
    assert "Mantequilla" in names
    assert "Cereales muesli" in names


def test_generic_fallback_total_excluded():
    result = parse_receipt(GENERIC_OCR)
    names = [l.name for l in result.lines]
    assert not any("Total" in n for n in names)


def test_price_parsed_as_float():
    result = parse_receipt(MERCADONA_OCR)
    almendras = next(l for l in result.lines if "ALMENDRAS" in l.name)
    assert almendras.price == pytest.approx(1.15)
