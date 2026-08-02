"""add user_list_prefs table

Revision ID: 9c4e71d0b2a5
Revises: 58a62fa8dbe1
Create Date: 2026-08-02 21:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9c4e71d0b2a5"
down_revision: str | Sequence[str] | None = "58a62fa8dbe1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_list_prefs",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("list_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("board", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["list_id"], ["lists.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "list_id"),
    )
    op.create_index(op.f("ix_user_list_prefs_user_id"), "user_list_prefs", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_user_list_prefs_user_id"), table_name="user_list_prefs")
    op.drop_table("user_list_prefs")
