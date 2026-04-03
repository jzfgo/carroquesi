"""drop_variety_from_list_items

Revision ID: a3f9c2e10b47
Revises: 661153072156
Create Date: 2026-04-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f9c2e10b47'
down_revision: Union[str, Sequence[str], None] = '661153072156'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Append variety value to name for rows that have one
    op.execute(
        "UPDATE list_items SET name = name || ' ' || variety WHERE variety IS NOT NULL AND variety != ''"
    )
    op.drop_column('list_items', 'variety')


def downgrade() -> None:
    op.add_column(
        'list_items',
        sa.Column('variety', sa.String(), nullable=True),
    )
