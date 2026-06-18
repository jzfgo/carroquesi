"""create waitlist signups table

Revision ID: 87f9e6dd4ce1
Revises: b3c4d5e6f7a8
Create Date: 2026-06-03 18:26:34.912878

"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '87f9e6dd4ce1'
down_revision: str | Sequence[str] | None = 'b3c4d5e6f7a8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('waitlist_signups',
    sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('email', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_waitlist_signups_email'), 'waitlist_signups', ['email'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_waitlist_signups_email'), table_name='waitlist_signups')
    op.drop_table('waitlist_signups')

