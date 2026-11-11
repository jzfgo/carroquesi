"""add chain article mappings

Revision ID: b03a440d26d8
Revises: f30c04a9ac0e
Create Date: 2026-11-11 10:46:40.078668

Per list, a chain's in-store label article code and the product it was.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b03a440d26d8"
down_revision: str | Sequence[str] | None = "f30c04a9ac0e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chain_article_mappings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("list_id", sa.String(), nullable=False),
        sa.Column("chain", sa.String(), nullable=False),
        sa.Column("article", sa.String(), nullable=False),
        sa.Column("item_name", sa.String(), nullable=False),
        sa.Column("item_brand", sa.String(), nullable=True),
        sa.Column("confirmed_by", sa.String(), nullable=False),
        sa.Column("use_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["list_id"], ["lists.id"]),
        sa.ForeignKeyConstraint(["confirmed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("list_id", "chain", "article"),
    )


def downgrade() -> None:
    op.drop_table("chain_article_mappings")
