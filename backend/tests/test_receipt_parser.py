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

AHORRAMAS_OCR = """AHORRAMAS
C/ EJEMPLO 2, MADRID
12/04/2026 10:30

LECHE ENTERA 1L    A  0,89
PAN DE MOLDE       B  1,25
ACEITE OLIVA 1L    A  4,50

TOTAL              6,64
"""

GENERIC_OCR = """SUPERMERCADO BM
Calle Mayor 5

Yogur natural    0,75
Mantequilla      1,30
Cereales muesli  2,45

Total            4,50
"""


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


def test_ahorramas_store_detected():
    result = parse_receipt(AHORRAMAS_OCR)
    assert result.store == "Ahorramas"


def test_ahorramas_items_parsed():
    result = parse_receipt(AHORRAMAS_OCR)
    names = [l.name for l in result.lines]
    assert "LECHE ENTERA 1L" in names
    assert "PAN DE MOLDE" in names


def test_ahorramas_non_items_excluded():
    result = parse_receipt(AHORRAMAS_OCR)
    names = [l.name for l in result.lines]
    assert not any("TOTAL" in n for n in names)


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
