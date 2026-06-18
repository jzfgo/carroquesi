"""add_list_emoji

Revision ID: c1d2e3f4a5b6
Revises: a3f9c2e10b47
Create Date: 2026-04-04 00:00:00.000000

"""
import random
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c1d2e3f4a5b6'
down_revision: str | Sequence[str] | None = 'a3f9c2e10b47'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CURATED_EMOJIS = [
    '🍎', '🥦', '🥕', '🧅', '🧄', '🍋', '🍇', '🥩', '🍗', '🥛',
    '🧀', '🥚', '🍞', '🧁', '🍫', '🍷', '🧃',
    '🛒', '🏠', '🧹', '🧺', '🧴', '🪥', '🧻', '💊', '🐾', '👶',
    '🌿', '🌸', '⭐', '🎉', '❤️', '🔥', '💧', '🌙',
]


def upgrade() -> None:
    op.add_column('lists', sa.Column('emoji', sa.String(), nullable=True))
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM lists")).fetchall()
    for row in rows:
        conn.execute(
            sa.text("UPDATE lists SET emoji = :emoji WHERE id = :id"),
            {"emoji": random.choice(CURATED_EMOJIS), "id": row[0]},
        )


def downgrade() -> None:
    op.drop_column('lists', 'emoji')
