import pytest

from app.services.pack_from_name import format_in_name, format_in_quantity


@pytest.mark.parametrize(
    ("name", "stripped", "pack"),
    [
        ("Agua mineral 6x1,5L", "Agua mineral", {"count": 6, "content": 1.5, "unit": "l"}),
        ("Agua mineral 6 x 1.5 l", "Agua mineral", {"count": 6, "content": 1.5, "unit": "l"}),
        ("Cerveza 12×33cl", "Cerveza", {"count": 12, "content": 33, "unit": "cl"}),
        ("Atún claro 3x80g", "Atún claro", {"count": 3, "content": 80, "unit": "g"}),
        ("Leche entera 1L", "Leche entera", {"count": 1, "content": 1, "unit": "l"}),
        ("Patatas fritas 108g", "Patatas fritas", {"count": 1, "content": 108, "unit": "g"}),
        ("Zumo 20cl", "Zumo", {"count": 1, "content": 20, "unit": "cl"}),
        ("Arroz 1 kg", "Arroz", {"count": 1, "content": 1, "unit": "kg"}),
        ("Harina 500 gr.", "Harina", {"count": 1, "content": 500, "unit": "g"}),
        ("Aceite 2 litros", "Aceite", {"count": 1, "content": 2, "unit": "l"}),
        ("Cerveza pack de 6 33cl", "Cerveza", {"count": 6, "content": 33, "unit": "cl"}),
        ("Leche pack 6 x 1L", "Leche", {"count": 6, "content": 1, "unit": "l"}),
        ("Yogur natural pack de 4", "Yogur natural", {"count": 4, "content": None, "unit": None}),
        ("Huevos x12", "Huevos", {"count": 12, "content": None, "unit": None}),
        ("Pilas 4 uds", "Pilas", {"count": 4, "content": None, "unit": None}),
        ("Agua (6x1,5L)", "Agua", {"count": 6, "content": 1.5, "unit": "l"}),
        ("Agua de 1,5L", "Agua", {"count": 1, "content": 1.5, "unit": "l"}),
        ("Agua - 1,5L", "Agua", {"count": 1, "content": 1.5, "unit": "l"}),
        ("Tomate 1kg rama", "Tomate rama", {"count": 1, "content": 1, "unit": "kg"}),
        ("Tomate (bandeja 400g)", "Tomate (bandeja)", {"count": 1, "content": 400, "unit": "g"}),
        # A size in cm is no format, so the count is the only one.
        (
            "Papel de horno 19,5x19,5cm (50 unidades)",
            "Papel de horno 19,5x19,5cm",
            {"count": 50, "content": None, "unit": None},
        ),
    ],
)
def test_reads_and_strips_a_format(name, stripped, pack):
    assert format_in_name(name) == (stripped, pack)


@pytest.mark.parametrize(
    "name",
    [
        "Leche entera",
        "Pizza 4 quesos",
        "Vitamina B12",
        "Yogur 0%",
        # Two sizes: which one is the format is a guess.
        "Agua 1,5L y 500ml",
        "Agua 6x1L y 500ml",
        "Agua 6x1L y 4x1L",
        "Cerveza 6x33cl pack de 4",
        "Huevos x6 pack de 12",
        # A size, not a count: «x 18» follows a number.
        "Servilletas 18 x 18 cm",
        "Servilletas 33 x 33",
        # «1.000» groups thousands in Spanish: refused, not read as one.
        "Agua 1.000 ml",
        # Nothing left for a name.
        "1,5L",
        "pack de 6",
        # Out of the API's bounds: it would break every read of the line.
        "Algo 0g",
        "Lote 2000 x 1L",
        # A pack of one says nothing.
        "Huevos x1",
        # Longer than any product name: not parsed at all.
        "Agua" + " -" * 200 + " 1L",
    ],
)
def test_leaves_a_name_without_one_format_alone(name):
    assert format_in_name(name) is None


@pytest.mark.parametrize(
    ("quantity", "pack"),
    [
        ("1,5 L", {"count": 1, "content": 1.5, "unit": "l"}),
        ("500 g", {"count": 1, "content": 500, "unit": "g"}),
        ("500g", {"count": 1, "content": 500, "unit": "g"}),
        ("6x1L", {"count": 6, "content": 1, "unit": "l"}),
    ],
)
def test_reads_a_package_size_in_a_quantity(quantity, pack):
    assert format_in_quantity(quantity) == pack


@pytest.mark.parametrize("quantity", [None, "", "2", "2 ud", "1,5 L extra", "medio kilo"])
def test_a_count_or_text_quantity_is_no_format(quantity):
    assert format_in_quantity(quantity) is None
