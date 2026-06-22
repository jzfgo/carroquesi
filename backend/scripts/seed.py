#!/usr/bin/env python3
"""
Seed script — populates the local database with test data.

Run from the backend directory:
    uv run python scripts/seed.py

Idempotent: deletes all rows whose PK starts with "seed-" before reinserting.
Real user accounts are never touched.

Test users (no real Firebase project needed):
    Alice  firebase_uid=seed-alice   (owner of Compra semanal + Fiesta de cumple)
    Bob    firebase_uid=seed-bob     (member of Compra semanal, owns Lista de Bob)
    Carol  firebase_uid=seed-carol   (separate user, owns Lista de Carol)

Price history tabs — what each scope adds for tracked items:

  Leche Hacendado
    Esta lista  : Alice @ Mercadona x6, Alice @ Dia x3, Bob @ Carrefour x2
    Mis listas  : + Alice @ El Corte Inglés x2 (bought for the party)
    Todos       : + Carol @ Dia x5, Carol @ Carrefour x4, Carol @ Alcampo x3

  Cafe molido Nescafe
    Esta lista  : Alice @ Mercadona x6, Bob @ Mercadona x3, Alice @ Carrefour x3
    Mis listas  : (no fiesta overlap)
    Todos       : + Carol @ Carrefour x5, Carol @ Alcampo x3

  Pasta Gallo
    Esta lista  : Alice @ Mercadona x5, Bob @ Dia x4, Alice @ Lidl x2
    Mis listas  : (no fiesta overlap)
    Todos       : + Carol @ Mercadona x5, Carol @ Lidl x3

  Aceite de oliva Carbonell
    Esta lista  : Alice @ Mercadona x5, Alice @ Carrefour x3
    Mis listas  : + Alice @ El Corte Inglés x2 (premium olive oil for the party)
    Todos       : + Carol @ Mercadona x4, Carol @ Carrefour x2

  Agua mineral (no brand — matches by name only)
    Esta lista  : Alice @ Mercadona x4, Bob @ Dia x3
    Mis listas  : + Alice @ El Corte Inglés x3 (bought for the party, more expensive)
    Todos       : + Carol @ Mercadona x4, Carol @ Lidl x3

  Manzanas (no brand)
    Esta lista  : Alice @ Mercadona x5
    Todos       : + Carol @ Mercadona x4, Carol @ Dia x3
"""

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select

from app.core.config import settings
from app.db.models import BarcodeCache, List, ListInvite, ListItem, ListMember, User, UserFeature
from app.db.session import engine


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def days_ago(n: float) -> datetime:
    return (datetime.now(UTC) - timedelta(days=n)).replace(tzinfo=None)


ALICE_ID = "seed-user-alice"
BOB_ID = "seed-user-bob"
CAROL_ID = "seed-user-carol"

SEED_USERS = [
    User(
        id=ALICE_ID,
        firebase_uid="seed-alice",
        display_name="Alice (seed)",
        email="alice@seed.local",
    ),
    User(id=BOB_ID, firebase_uid="seed-bob", display_name="Bob (seed)", email="bob@seed.local"),
    User(
        id=CAROL_ID,
        firebase_uid="seed-carol",
        display_name="Carol (seed)",
        email="carol@seed.local",
    ),
]

SEED_LISTS = [
    List(id="seed-list-compra", name="Compra semanal", emoji="🛒", owner_id=ALICE_ID),
    List(id="seed-list-fiesta", name="Fiesta de cumple", emoji="🎉", owner_id=ALICE_ID),
    List(id="seed-list-bob", name="Lista de Bob", emoji="📝", owner_id=BOB_ID),
    List(id="seed-list-carol", name="Lista de Carol", emoji="🌿", owner_id=CAROL_ID),
]

SEED_MEMBERS = [
    ListMember(id="seed-mem-alice-compra", list_id="seed-list-compra", user_id=ALICE_ID),
    ListMember(id="seed-mem-bob-compra", list_id="seed-list-compra", user_id=BOB_ID),
    ListMember(id="seed-mem-alice-fiesta", list_id="seed-list-fiesta", user_id=ALICE_ID),
    ListMember(id="seed-mem-bob-bob", list_id="seed-list-bob", user_id=BOB_ID),
    ListMember(id="seed-mem-carol-carol", list_id="seed-list-carol", user_id=CAROL_ID),
]

SEED_ITEMS = [
    # ════════════════════════════════════════════════════════════════════════
    # COMPRA SEMANAL — pending items
    # ════════════════════════════════════════════════════════════════════════
    ListItem(
        id="seed-item-leche",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Mercadona"],
        added_by=ALICE_ID,
    ),
    ListItem(
        id="seed-item-pan",
        list_id="seed-list-compra",
        name="Pan de molde",
        quantity="1",
        brand=None,
        stores=[],
        added_by=ALICE_ID,
    ),
    ListItem(
        id="seed-item-huevos",
        list_id="seed-list-compra",
        name="Huevos",
        quantity="12",
        brand=None,
        stores=["Mercadona", "Dia"],
        added_by=BOB_ID,
    ),
    ListItem(
        id="seed-item-tomates",
        list_id="seed-list-compra",
        name="Tomates",
        quantity="1kg",
        brand=None,
        stores=[],
        added_by=BOB_ID,
    ),
    ListItem(
        id="seed-item-detergente",
        list_id="seed-list-compra",
        name="Detergente",
        quantity="1",
        brand="Ariel",
        stores=["Carrefour"],
        added_by=ALICE_ID,
    ),
    ListItem(
        id="seed-item-agua",
        list_id="seed-list-compra",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Mercadona"],
        added_by=ALICE_ID,
    ),
    # ════════════════════════════════════════════════════════════════════════
    # COMPRA SEMANAL — purchased today (can be unchecked)
    # ════════════════════════════════════════════════════════════════════════
    ListItem(
        id="seed-item-cafe-today",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(0.1),
        price=3.45,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-item-yogur",
        list_id="seed-list-compra",
        name="Yogur natural",
        quantity="8",
        brand="Danone",
        stores=[],
        added_by=BOB_ID,
        purchased_at=days_ago(0.2),
    ),
    # ════════════════════════════════════════════════════════════════════════
    # COMPRA SEMANAL — purchased on past days (read-only)
    # ════════════════════════════════════════════════════════════════════════
    ListItem(
        id="seed-item-jamon",
        list_id="seed-list-compra",
        name="Jamon cocido",
        quantity="200g",
        brand="Campofrio",
        stores=["Mercadona"],
        added_by=BOB_ID,
        purchased_at=days_ago(4),
    ),
    ListItem(
        id="seed-item-queso",
        list_id="seed-list-compra",
        name="Queso manchego",
        quantity="300g",
        brand=None,
        stores=[],
        added_by=BOB_ID,
        purchased_at=days_ago(11),
    ),
    # ════════════════════════════════════════════════════════════════════════
    # PRICE HISTORY — Leche Hacendado
    # Esta lista: Alice @ Mercadona x6, Alice @ Dia x3, Bob @ Carrefour x2
    # ════════════════════════════════════════════════════════════════════════
    # Alice @ Mercadona — gradual price rise over 3 months
    ListItem(
        id="seed-ph-leche-a-mdn-1",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(84),
        price=0.99,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-leche-a-mdn-2",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(63),
        price=1.05,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-leche-a-mdn-3",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(42),
        price=1.05,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-leche-a-mdn-4",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(21),
        price=1.08,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-leche-a-mdn-5",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(14),
        price=1.12,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-leche-a-mdn-6",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(7),
        price=1.15,
        price_store="Mercadona",
    ),
    # Alice @ Dia — cheaper but inconsistent
    ListItem(
        id="seed-ph-leche-a-dia-1",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Dia"],
        added_by=ALICE_ID,
        purchased_at=days_ago(70),
        price=0.95,
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-leche-a-dia-2",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Dia"],
        added_by=ALICE_ID,
        purchased_at=days_ago(49),
        price=0.98,
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-leche-a-dia-3",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Dia"],
        added_by=ALICE_ID,
        purchased_at=days_ago(28),
        price=1.02,
        price_store="Dia",
    ),
    # Bob @ Carrefour — pricier, less frequent
    ListItem(
        id="seed-ph-leche-b-crf-1",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Carrefour"],
        added_by=BOB_ID,
        purchased_at=days_ago(55),
        price=1.19,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-leche-b-crf-2",
        list_id="seed-list-compra",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Carrefour"],
        added_by=BOB_ID,
        purchased_at=days_ago(18),
        price=1.22,
        price_store="Carrefour",
    ),
    # ════════════════════════════════════════════════════════════════════════
    # PRICE HISTORY — Cafe molido Nescafe
    # Esta lista: Alice @ Mercadona x6, Bob @ Mercadona x3, Alice @ Carrefour x3
    # ════════════════════════════════════════════════════════════════════════
    # Alice @ Mercadona — dip then recovery (promotion mid-period)
    ListItem(
        id="seed-ph-cafe-a-mdn-1",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(90),
        price=3.65,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-cafe-a-mdn-2",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(75),
        price=3.65,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-cafe-a-mdn-3",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(55),
        price=3.29,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-cafe-a-mdn-4",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(40),
        price=3.29,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-cafe-a-mdn-5",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(25),
        price=3.49,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-cafe-a-mdn-6",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(12),
        price=3.55,
        price_store="Mercadona",
    ),
    # Bob @ Mercadona — same store, slightly different times, confirms the prices
    ListItem(
        id="seed-ph-cafe-b-mdn-1",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Mercadona"],
        added_by=BOB_ID,
        purchased_at=days_ago(65),
        price=3.29,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-cafe-b-mdn-2",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Mercadona"],
        added_by=BOB_ID,
        purchased_at=days_ago(33),
        price=3.49,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-cafe-b-mdn-3",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Mercadona"],
        added_by=BOB_ID,
        purchased_at=days_ago(5),
        price=3.55,
        price_store="Mercadona",
    ),
    # Alice @ Carrefour — consistently pricier
    ListItem(
        id="seed-ph-cafe-a-crf-1",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Carrefour"],
        added_by=ALICE_ID,
        purchased_at=days_ago(80),
        price=3.89,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-cafe-a-crf-2",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Carrefour"],
        added_by=ALICE_ID,
        purchased_at=days_ago(50),
        price=3.75,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-cafe-a-crf-3",
        list_id="seed-list-compra",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Carrefour"],
        added_by=ALICE_ID,
        purchased_at=days_ago(20),
        price=3.79,
        price_store="Carrefour",
    ),
    # ════════════════════════════════════════════════════════════════════════
    # PRICE HISTORY — Pasta Gallo
    # Esta lista: Alice @ Mercadona x5, Bob @ Dia x4, Alice @ Lidl x2
    # ════════════════════════════════════════════════════════════════════════
    # Alice @ Mercadona
    ListItem(
        id="seed-ph-pasta-a-mdn-1",
        list_id="seed-list-compra",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(80),
        price=1.49,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-pasta-a-mdn-2",
        list_id="seed-list-compra",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(60),
        price=1.45,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-pasta-a-mdn-3",
        list_id="seed-list-compra",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(40),
        price=1.39,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-pasta-a-mdn-4",
        list_id="seed-list-compra",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(20),
        price=1.40,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-pasta-a-mdn-5",
        list_id="seed-list-compra",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(5),
        price=1.35,
        price_store="Mercadona",
    ),
    # Bob @ Dia — cheapest option
    ListItem(
        id="seed-ph-pasta-b-dia-1",
        list_id="seed-list-compra",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Dia"],
        added_by=BOB_ID,
        purchased_at=days_ago(75),
        price=1.19,
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-pasta-b-dia-2",
        list_id="seed-list-compra",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Dia"],
        added_by=BOB_ID,
        purchased_at=days_ago(52),
        price=1.22,
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-pasta-b-dia-3",
        list_id="seed-list-compra",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Dia"],
        added_by=BOB_ID,
        purchased_at=days_ago(30),
        price=1.25,
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-pasta-b-dia-4",
        list_id="seed-list-compra",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Dia"],
        added_by=BOB_ID,
        purchased_at=days_ago(9),
        price=1.25,
        price_store="Dia",
    ),
    # Alice @ Lidl — occasional, mid-range
    ListItem(
        id="seed-ph-pasta-a-lid-1",
        list_id="seed-list-compra",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Lidl"],
        added_by=ALICE_ID,
        purchased_at=days_ago(68),
        price=1.29,
        price_store="Lidl",
    ),
    ListItem(
        id="seed-ph-pasta-a-lid-2",
        list_id="seed-list-compra",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Lidl"],
        added_by=ALICE_ID,
        purchased_at=days_ago(35),
        price=1.29,
        price_store="Lidl",
    ),
    # ════════════════════════════════════════════════════════════════════════
    # PRICE HISTORY — Aceite de oliva Carbonell
    # Esta lista: Alice @ Mercadona x5, Alice @ Carrefour x3
    # ════════════════════════════════════════════════════════════════════════
    # Alice @ Mercadona — volatile, climbing
    ListItem(
        id="seed-ph-aceite-a-mdn-1",
        list_id="seed-list-compra",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(100),
        price=4.49,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-aceite-a-mdn-2",
        list_id="seed-list-compra",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(75),
        price=4.79,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-aceite-a-mdn-3",
        list_id="seed-list-compra",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(50),
        price=5.10,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-aceite-a-mdn-4",
        list_id="seed-list-compra",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(25),
        price=4.99,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-aceite-a-mdn-5",
        list_id="seed-list-compra",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(8),
        price=5.25,
        price_store="Mercadona",
    ),
    # Alice @ Carrefour — slightly more expensive
    ListItem(
        id="seed-ph-aceite-a-crf-1",
        list_id="seed-list-compra",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Carrefour"],
        added_by=ALICE_ID,
        purchased_at=days_ago(90),
        price=4.89,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-aceite-a-crf-2",
        list_id="seed-list-compra",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Carrefour"],
        added_by=ALICE_ID,
        purchased_at=days_ago(60),
        price=5.29,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-aceite-a-crf-3",
        list_id="seed-list-compra",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Carrefour"],
        added_by=ALICE_ID,
        purchased_at=days_ago(15),
        price=5.49,
        price_store="Carrefour",
    ),
    # ════════════════════════════════════════════════════════════════════════
    # PRICE HISTORY — Agua mineral (no brand)
    # Esta lista: Alice @ Mercadona x4, Bob @ Dia x3
    # ════════════════════════════════════════════════════════════════════════
    ListItem(
        id="seed-ph-agua-a-mdn-1",
        list_id="seed-list-compra",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(60),
        price=0.89,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-agua-a-mdn-2",
        list_id="seed-list-compra",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(45),
        price=0.89,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-agua-a-mdn-3",
        list_id="seed-list-compra",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(28),
        price=0.92,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-agua-a-mdn-4",
        list_id="seed-list-compra",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(10),
        price=0.92,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-agua-b-dia-1",
        list_id="seed-list-compra",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Dia"],
        added_by=BOB_ID,
        purchased_at=days_ago(55),
        price=0.79,
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-agua-b-dia-2",
        list_id="seed-list-compra",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Dia"],
        added_by=BOB_ID,
        purchased_at=days_ago(35),
        price=0.82,
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-agua-b-dia-3",
        list_id="seed-list-compra",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Dia"],
        added_by=BOB_ID,
        purchased_at=days_ago(12),
        price=0.82,
        price_store="Dia",
    ),
    # ════════════════════════════════════════════════════════════════════════
    # PRICE HISTORY — Manzanas (no brand, per kg)
    # Esta lista: Alice @ Mercadona x5
    # ════════════════════════════════════════════════════════════════════════
    ListItem(
        id="seed-ph-manz-a-mdn-1",
        list_id="seed-list-compra",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(70),
        price=1.89,
        price_per="KILOGRAM",
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-manz-a-mdn-2",
        list_id="seed-list-compra",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(52),
        price=2.10,
        price_per="KILOGRAM",
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-manz-a-mdn-3",
        list_id="seed-list-compra",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(35),
        price=1.99,
        price_per="KILOGRAM",
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-manz-a-mdn-4",
        list_id="seed-list-compra",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(18),
        price=2.25,
        price_per="KILOGRAM",
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-manz-a-mdn-5",
        list_id="seed-list-compra",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(4),
        price=2.10,
        price_per="KILOGRAM",
        price_store="Mercadona",
    ),
    # ════════════════════════════════════════════════════════════════════════
    # PAPEL HIGIÉNICO — due-suggestion trigger (3x monthly) + price data
    # ════════════════════════════════════════════════════════════════════════
    ListItem(
        id="seed-ph-papel-1",
        list_id="seed-list-compra",
        name="Papel higienico",
        quantity="12",
        brand="Renova",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(62),
        price=3.95,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-papel-2",
        list_id="seed-list-compra",
        name="Papel higienico",
        quantity="12",
        brand="Renova",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(31),
        price=4.15,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-papel-3",
        list_id="seed-list-compra",
        name="Papel higienico",
        quantity="12",
        brand="Renova",
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(2),
        price=4.29,
        price_store="Mercadona",
    ),
    # ════════════════════════════════════════════════════════════════════════
    # FIESTA DE CUMPLE
    # Shared items (Leche, Aceite, Agua) add entries to "Mis listas" scope
    # ════════════════════════════════════════════════════════════════════════
    ListItem(
        id="seed-item-cava",
        list_id="seed-list-fiesta",
        name="Cava",
        quantity="3",
        brand="Codorniu",
        stores=["El Corte Ingles"],
        added_by=ALICE_ID,
    ),
    ListItem(
        id="seed-item-globos",
        list_id="seed-list-fiesta",
        name="Globos",
        quantity="50",
        brand=None,
        stores=[],
        added_by=ALICE_ID,
    ),
    ListItem(
        id="seed-item-tarta",
        list_id="seed-list-fiesta",
        name="Tarta de cumple",
        quantity="1",
        brand=None,
        stores=["Mercadona"],
        added_by=ALICE_ID,
        purchased_at=days_ago(1),
    ),
    # Leche for the party — El Corte Inglés, pricier (adds to "Mis listas" scope for Leche)
    ListItem(
        id="seed-ph-leche-f-eci-1",
        list_id="seed-list-fiesta",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["El Corte Ingles"],
        added_by=ALICE_ID,
        purchased_at=days_ago(16),
        price=1.39,
        price_store="El Corte Ingles",
    ),
    ListItem(
        id="seed-ph-leche-f-eci-2",
        list_id="seed-list-fiesta",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["El Corte Ingles"],
        added_by=ALICE_ID,
        purchased_at=days_ago(2),
        price=1.42,
        price_store="El Corte Ingles",
    ),
    # Aceite for the party — El Corte Inglés, premium
    ListItem(
        id="seed-ph-aceite-f-eci-1",
        list_id="seed-list-fiesta",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["El Corte Ingles"],
        added_by=ALICE_ID,
        purchased_at=days_ago(14),
        price=6.10,
        price_store="El Corte Ingles",
    ),
    ListItem(
        id="seed-ph-aceite-f-eci-2",
        list_id="seed-list-fiesta",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["El Corte Ingles"],
        added_by=ALICE_ID,
        purchased_at=days_ago(3),
        price=5.95,
        price_store="El Corte Ingles",
    ),
    # Agua for the party — El Corte Inglés, more expensive
    ListItem(
        id="seed-ph-agua-f-eci-1",
        list_id="seed-list-fiesta",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["El Corte Ingles"],
        added_by=ALICE_ID,
        purchased_at=days_ago(20),
        price=1.49,
        price_store="El Corte Ingles",
    ),
    ListItem(
        id="seed-ph-agua-f-eci-2",
        list_id="seed-list-fiesta",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["El Corte Ingles"],
        added_by=ALICE_ID,
        purchased_at=days_ago(10),
        price=1.49,
        price_store="El Corte Ingles",
    ),
    ListItem(
        id="seed-ph-agua-f-eci-3",
        list_id="seed-list-fiesta",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["El Corte Ingles"],
        added_by=ALICE_ID,
        purchased_at=days_ago(2),
        price=1.55,
        price_store="El Corte Ingles",
    ),
    # ════════════════════════════════════════════════════════════════════════
    # BOB'S LIST
    # ════════════════════════════════════════════════════════════════════════
    ListItem(
        id="seed-item-cerveza",
        list_id="seed-list-bob",
        name="Cerveza",
        quantity="6",
        brand="Estrella",
        stores=["Mercadona"],
        added_by=BOB_ID,
    ),
    ListItem(
        id="seed-item-patatas",
        list_id="seed-list-bob",
        name="Patatas fritas",
        quantity="2",
        brand="Lays",
        stores=[],
        added_by=BOB_ID,
    ),
    # ════════════════════════════════════════════════════════════════════════
    # CAROL'S LIST — adds entries to "Todos" scope for all tracked items
    # ════════════════════════════════════════════════════════════════════════
    # Leche Hacendado @ Dia — cheaper than Mercadona, steady
    ListItem(
        id="seed-ph-leche-c-dia-1",
        list_id="seed-list-carol",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Dia"],
        added_by=CAROL_ID,
        purchased_at=days_ago(78),
        price=0.93,
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-leche-c-dia-2",
        list_id="seed-list-carol",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Dia"],
        added_by=CAROL_ID,
        purchased_at=days_ago(57),
        price=0.95,
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-leche-c-dia-3",
        list_id="seed-list-carol",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Dia"],
        added_by=CAROL_ID,
        purchased_at=days_ago(36),
        price=1.00,
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-leche-c-dia-4",
        list_id="seed-list-carol",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Dia"],
        added_by=CAROL_ID,
        purchased_at=days_ago(15),
        price=1.05,
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-leche-c-dia-5",
        list_id="seed-list-carol",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Dia"],
        added_by=CAROL_ID,
        purchased_at=days_ago(3),
        price=1.07,
        price_store="Dia",
    ),
    # Leche Hacendado @ Carrefour — mid-range, irregular
    ListItem(
        id="seed-ph-leche-c-crf-1",
        list_id="seed-list-carol",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Carrefour"],
        added_by=CAROL_ID,
        purchased_at=days_ago(65),
        price=1.15,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-leche-c-crf-2",
        list_id="seed-list-carol",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Carrefour"],
        added_by=CAROL_ID,
        purchased_at=days_ago(40),
        price=1.18,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-leche-c-crf-3",
        list_id="seed-list-carol",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Carrefour"],
        added_by=CAROL_ID,
        purchased_at=days_ago(12),
        price=1.19,
        price_store="Carrefour",
    ),
    # Leche @ Alcampo
    ListItem(
        id="seed-ph-leche-c-alc-1",
        list_id="seed-list-carol",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Alcampo"],
        added_by=CAROL_ID,
        purchased_at=days_ago(50),
        price=1.09,
        price_store="Alcampo",
    ),
    ListItem(
        id="seed-ph-leche-c-alc-2",
        list_id="seed-list-carol",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Alcampo"],
        added_by=CAROL_ID,
        purchased_at=days_ago(22),
        price=1.12,
        price_store="Alcampo",
    ),
    ListItem(
        id="seed-ph-leche-c-alc-3",
        list_id="seed-list-carol",
        name="Leche",
        quantity="6",
        brand="Hacendado",
        stores=["Alcampo"],
        added_by=CAROL_ID,
        purchased_at=days_ago(6),
        price=1.12,
        price_store="Alcampo",
    ),
    # Cafe Nescafe @ Carrefour — Carol's main store for coffee
    ListItem(
        id="seed-ph-cafe-c-crf-1",
        list_id="seed-list-carol",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Carrefour"],
        added_by=CAROL_ID,
        purchased_at=days_ago(85),
        price=3.59,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-cafe-c-crf-2",
        list_id="seed-list-carol",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Carrefour"],
        added_by=CAROL_ID,
        purchased_at=days_ago(68),
        price=3.55,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-cafe-c-crf-3",
        list_id="seed-list-carol",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Carrefour"],
        added_by=CAROL_ID,
        purchased_at=days_ago(47),
        price=3.35,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-cafe-c-crf-4",
        list_id="seed-list-carol",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Carrefour"],
        added_by=CAROL_ID,
        purchased_at=days_ago(28),
        price=3.35,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-cafe-c-crf-5",
        list_id="seed-list-carol",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Carrefour"],
        added_by=CAROL_ID,
        purchased_at=days_ago(8),
        price=3.45,
        price_store="Carrefour",
    ),
    # Cafe @ Alcampo
    ListItem(
        id="seed-ph-cafe-c-alc-1",
        list_id="seed-list-carol",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Alcampo"],
        added_by=CAROL_ID,
        purchased_at=days_ago(72),
        price=3.49,
        price_store="Alcampo",
    ),
    ListItem(
        id="seed-ph-cafe-c-alc-2",
        list_id="seed-list-carol",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Alcampo"],
        added_by=CAROL_ID,
        purchased_at=days_ago(38),
        price=3.39,
        price_store="Alcampo",
    ),
    ListItem(
        id="seed-ph-cafe-c-alc-3",
        list_id="seed-list-carol",
        name="Cafe molido",
        quantity="250g",
        brand="Nescafe",
        stores=["Alcampo"],
        added_by=CAROL_ID,
        purchased_at=days_ago(11),
        price=3.39,
        price_store="Alcampo",
    ),
    # Pasta Gallo @ Mercadona (Carol) — slightly higher than Alice's recent prices
    ListItem(
        id="seed-ph-pasta-c-mdn-1",
        list_id="seed-list-carol",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(82),
        price=1.49,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-pasta-c-mdn-2",
        list_id="seed-list-carol",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(62),
        price=1.45,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-pasta-c-mdn-3",
        list_id="seed-list-carol",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(42),
        price=1.39,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-pasta-c-mdn-4",
        list_id="seed-list-carol",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(22),
        price=1.35,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-pasta-c-mdn-5",
        list_id="seed-list-carol",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(6),
        price=1.35,
        price_store="Mercadona",
    ),
    # Pasta @ Lidl (Carol) — cheap
    ListItem(
        id="seed-ph-pasta-c-lid-1",
        list_id="seed-list-carol",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Lidl"],
        added_by=CAROL_ID,
        purchased_at=days_ago(76),
        price=1.19,
        price_store="Lidl",
    ),
    ListItem(
        id="seed-ph-pasta-c-lid-2",
        list_id="seed-list-carol",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Lidl"],
        added_by=CAROL_ID,
        purchased_at=days_ago(48),
        price=1.19,
        price_store="Lidl",
    ),
    ListItem(
        id="seed-ph-pasta-c-lid-3",
        list_id="seed-list-carol",
        name="Pasta",
        quantity="500g",
        brand="Gallo",
        stores=["Lidl"],
        added_by=CAROL_ID,
        purchased_at=days_ago(16),
        price=1.25,
        price_store="Lidl",
    ),
    # Aceite Carbonell @ Mercadona (Carol) — tracks Mercadona price trend
    ListItem(
        id="seed-ph-aceite-c-mdn-1",
        list_id="seed-list-carol",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(95),
        price=4.55,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-aceite-c-mdn-2",
        list_id="seed-list-carol",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(65),
        price=4.99,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-aceite-c-mdn-3",
        list_id="seed-list-carol",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(35),
        price=5.15,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-aceite-c-mdn-4",
        list_id="seed-list-carol",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(10),
        price=5.25,
        price_store="Mercadona",
    ),
    # Aceite @ Carrefour (Carol)
    ListItem(
        id="seed-ph-aceite-c-crf-1",
        list_id="seed-list-carol",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Carrefour"],
        added_by=CAROL_ID,
        purchased_at=days_ago(80),
        price=5.15,
        price_store="Carrefour",
    ),
    ListItem(
        id="seed-ph-aceite-c-crf-2",
        list_id="seed-list-carol",
        name="Aceite de oliva",
        quantity="1L",
        brand="Carbonell",
        stores=["Carrefour"],
        added_by=CAROL_ID,
        purchased_at=days_ago(45),
        price=5.39,
        price_store="Carrefour",
    ),
    # Agua mineral @ Mercadona (Carol) — confirms Alice+Bob Mercadona prices
    ListItem(
        id="seed-ph-agua-c-mdn-1",
        list_id="seed-list-carol",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(70),
        price=0.89,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-agua-c-mdn-2",
        list_id="seed-list-carol",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(48),
        price=0.89,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-agua-c-mdn-3",
        list_id="seed-list-carol",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(25),
        price=0.92,
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-agua-c-mdn-4",
        list_id="seed-list-carol",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(7),
        price=0.92,
        price_store="Mercadona",
    ),
    # Agua @ Lidl (Carol) — cheapest
    ListItem(
        id="seed-ph-agua-c-lid-1",
        list_id="seed-list-carol",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Lidl"],
        added_by=CAROL_ID,
        purchased_at=days_ago(63),
        price=0.69,
        price_store="Lidl",
    ),
    ListItem(
        id="seed-ph-agua-c-lid-2",
        list_id="seed-list-carol",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Lidl"],
        added_by=CAROL_ID,
        purchased_at=days_ago(34),
        price=0.72,
        price_store="Lidl",
    ),
    ListItem(
        id="seed-ph-agua-c-lid-3",
        list_id="seed-list-carol",
        name="Agua mineral",
        quantity="6",
        brand=None,
        stores=["Lidl"],
        added_by=CAROL_ID,
        purchased_at=days_ago(9),
        price=0.72,
        price_store="Lidl",
    ),
    # Manzanas (no brand) — Carol confirms Mercadona /kg prices + adds Dia
    ListItem(
        id="seed-ph-manz-c-mdn-1",
        list_id="seed-list-carol",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(66),
        price=1.95,
        price_per="KILOGRAM",
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-manz-c-mdn-2",
        list_id="seed-list-carol",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(44),
        price=2.05,
        price_per="KILOGRAM",
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-manz-c-mdn-3",
        list_id="seed-list-carol",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(22),
        price=2.25,
        price_per="KILOGRAM",
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-manz-c-mdn-4",
        list_id="seed-list-carol",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Mercadona"],
        added_by=CAROL_ID,
        purchased_at=days_ago(5),
        price=2.10,
        price_per="KILOGRAM",
        price_store="Mercadona",
    ),
    ListItem(
        id="seed-ph-manz-c-dia-1",
        list_id="seed-list-carol",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Dia"],
        added_by=CAROL_ID,
        purchased_at=days_ago(58),
        price=1.75,
        price_per="KILOGRAM",
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-manz-c-dia-2",
        list_id="seed-list-carol",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Dia"],
        added_by=CAROL_ID,
        purchased_at=days_ago(30),
        price=1.80,
        price_per="KILOGRAM",
        price_store="Dia",
    ),
    ListItem(
        id="seed-ph-manz-c-dia-3",
        list_id="seed-list-carol",
        name="Manzanas",
        quantity="1kg",
        brand=None,
        stores=["Dia"],
        added_by=CAROL_ID,
        purchased_at=days_ago(8),
        price=1.85,
        price_per="KILOGRAM",
        price_store="Dia",
    ),
    # Items unique to Carol's list
    ListItem(
        id="seed-carol-lentejas",
        list_id="seed-list-carol",
        name="Lentejas",
        quantity="500g",
        brand="Luengo",
        stores=["Mercadona"],
        added_by=CAROL_ID,
    ),
    ListItem(
        id="seed-carol-platanos",
        list_id="seed-list-carol",
        name="Platanos",
        quantity="1kg",
        brand=None,
        stores=[],
        added_by=CAROL_ID,
    ),
]

SEED_INVITES = [
    ListInvite(
        id="seed-invite-compra", list_id="seed-list-compra", invited_email=None, invited_by=ALICE_ID
    ),
    ListInvite(
        id="seed-invite-fiesta",
        list_id="seed-list-fiesta",
        invited_email="charlie@example.com",
        invited_by=ALICE_ID,
    ),
]

SEED_BARCODES = [
    BarcodeCache(
        id="seed-bc-leche",
        ean="8410188113014",
        name="Leche Entera Hacendado",
        brand="Hacendado",
        stores="Mercadona",
    ),
    BarcodeCache(
        id="seed-bc-cafe",
        ean="7613035352100",
        name="Nescafe Classic",
        brand="Nescafe",
        stores="Mercadona,Carrefour",
    ),
    BarcodeCache(
        id="seed-bc-pasta",
        ean="8410175114008",
        name="Macarrones Gallo",
        brand="Gallo",
        stores="Mercadona",
    ),
]

SEED_FEATURES = [
    UserFeature(
        id="seed-feat-alice-receipt",
        user_id=ALICE_ID,
        feature="ai_receipt_scanning",
        enabled=True,
        granted_by="admin",
    ),
]


def _delete_seed_rows(session: Session) -> None:
    for model, id_col in [
        (UserFeature, UserFeature.id),
        (ListInvite, ListInvite.id),
        (ListItem, ListItem.id),
        (ListMember, ListMember.id),
        (List, List.id),
        (BarcodeCache, BarcodeCache.id),
        (User, User.id),
    ]:
        rows = session.exec(select(model).where(id_col.startswith("seed-"))).all()
        for row in rows:
            session.delete(row)
    session.commit()
    print("  cleared existing seed rows")


def _insert(session: Session, rows: list) -> None:
    for row in rows:
        session.add(row)
    session.commit()


def main() -> None:
    # Compute summary stats before session (objects expire after commit)
    price_items = [i for i in SEED_ITEMS if i.price is not None]
    stores = {i.price_store for i in price_items if i.price_store}

    print(f"\nSeeding: {settings.database_url}\n")
    with Session(engine) as session:
        _delete_seed_rows(session)
        _insert(session, SEED_USERS)
        print(f"  +{len(SEED_USERS)} users")
        _insert(session, SEED_LISTS)
        print(f"  +{len(SEED_LISTS)} lists")
        _insert(session, SEED_MEMBERS)
        print(f"  +{len(SEED_MEMBERS)} memberships")
        _insert(session, SEED_ITEMS)
        print(f"  +{len(SEED_ITEMS)} items")
        _insert(session, SEED_INVITES)
        print(f"  +{len(SEED_INVITES)} invites")
        _insert(session, SEED_BARCODES)
        print(f"  +{len(SEED_BARCODES)} barcode cache entries")
        _insert(session, SEED_FEATURES)
        print(f"  +{len(SEED_FEATURES)} feature flags")
    print(
        f"\nPrice data: {len(price_items)} entries across {len(stores)} stores: {', '.join(sorted(stores))}"
    )
    print("""
Tracked items and tab differences (open price history on any of these):

  Leche (Hacendado)     Esta lista: Mercadona x6, Dia x3, Carrefour x2
                        Mis listas: + El Corte Inglés x2
                        Todos:      + Carol @ Dia x5, Carrefour x3, Alcampo x3

  Cafe molido (Nescafe) Esta lista: Mercadona x9, Carrefour x3
                        Todos:      + Carol @ Carrefour x5, Alcampo x3

  Pasta (Gallo)         Esta lista: Mercadona x5, Dia x4, Lidl x2
                        Todos:      + Carol @ Mercadona x5, Lidl x3

  Aceite (Carbonell)    Esta lista: Mercadona x5, Carrefour x3
                        Mis listas: + El Corte Inglés x2
                        Todos:      + Carol @ Mercadona x4, Carrefour x2

  Agua mineral          Esta lista: Mercadona x4, Dia x3
                        Mis listas: + El Corte Inglés x3
                        Todos:      + Carol @ Mercadona x4, Lidl x3

  Manzanas              Esta lista: Mercadona x5 (/kg)
                        Todos:      + Carol @ Mercadona x4, Dia x3
""")


if __name__ == "__main__":
    main()
