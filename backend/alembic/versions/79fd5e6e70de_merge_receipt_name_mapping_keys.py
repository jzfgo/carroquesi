"""merge receipt name mapping keys

Revision ID: 79fd5e6e70de
Revises: 7005338bb031
Create Date: 2026-08-01 18:56:01.527589
"""

from collections.abc import Sequence

from alembic import op

revision: str = "79fd5e6e70de"
down_revision: str | Sequence[str] | None = "7005338bb031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Rewrite mapping rows to their normalised key form, merging rows that
    # collide. Data only, no DDL. Delegated to the shared ORM helper so the
    # logic is unit-tested (the suite builds its schema with create_all and
    # never runs Alembic). Imported lazily to keep module import cheap for
    # offline history/autogenerate commands.
    from sqlmodel import Session

    from app.services.store_key import merge_receipt_name_mapping_keys

    with Session(bind=op.get_bind()) as session:
        merge_receipt_name_mapping_keys(session)
        session.commit()


def downgrade() -> None:
    # The merge is lossy: original raw keys are gone and merged rows cannot
    # be split apart. Restoring a backup is the rollback. The table is a
    # learning cache, so the cost of doing nothing here is one re-confirm
    # per mapping at the next scan.
    pass
