"""add_invite_token_to_waitlist_signups

Revision ID: c26d1ad5d4f6
Revises: 4422da887db6
Create Date: 2026-06-03 23:04:27.280543

"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c26d1ad5d4f6'
down_revision: str | Sequence[str] | None = '4422da887db6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('waitlist_signups', sa.Column('invite_token', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('waitlist_signups', 'invite_token')
