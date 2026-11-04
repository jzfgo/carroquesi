"""store timestamps as timestamptz

Revision ID: 6cb2db34df07
Revises: 3f8a2c61d9e4
Create Date: 2026-11-04 20:07:15.069513

"""

from collections.abc import Sequence

from alembic import op

revision: str = "6cb2db34df07"
down_revision: str | None = "3f8a2c61d9e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Every timestamp column. Each one has held naive UTC until now.
COLUMNS: dict[str, tuple[str, ...]] = {
    "api_keys": ("created_at", "last_used_at"),
    "barcode_cache": ("created_at",),
    "feedback_submissions": ("created_at",),
    "list_invites": ("created_at",),
    "list_items": ("created_at", "updated_at", "purchased_at"),
    "list_members": ("created_at", "last_seen_at"),
    "list_stores": ("created_at", "updated_at"),
    "lists": ("created_at", "updated_at"),
    "purchases": ("opened_at", "tears_off_at", "closed_at"),
    "push_tokens": ("created_at", "last_registered_at"),
    "receipt_name_mappings": ("created_at", "updated_at"),
    "receipt_scans": ("created_at", "receipt_at"),
    "report_runs": ("started_at", "finished_at"),
    "user_features": ("created_at", "updated_at"),
    "user_list_prefs": ("created_at",),
    "users": ("created_at", "receipt_consent_at"),
    "waitlist_signups": ("created_at", "allowed_at"),
}


def _is_sqlite() -> bool:
    # get_context(), not get_bind(): the latter is None in offline mode, so
    # `alembic upgrade --sql` would blow up here instead of rendering a script.
    return op.get_context().dialect.name == "sqlite"


def _retype(target: str) -> None:
    # One ALTER TABLE per table, so Postgres rewrites each table once.
    # `AT TIME ZONE 'UTC'` reads a naive value as UTC and gives back the
    # aware instant; on an aware value it gives back naive UTC. So the same
    # clause serves both directions, and the session's TimeZone plays no part.
    for table, columns in COLUMNS.items():
        clauses = ", ".join(
            f"ALTER COLUMN {c} TYPE {target} USING {c} AT TIME ZONE 'UTC'" for c in columns
        )
        op.execute(f"ALTER TABLE {table} {clauses}")


def upgrade() -> None:
    # SQLite has no timezone type and nothing to change: it stores the same
    # text either way, and the model's column type adds UTC back on read.
    # Never route this through batch_alter_table: batch mode copies the table
    # with a CAST, which can corrupt values on a type change.
    if _is_sqlite():
        return
    _retype("timestamptz")


def downgrade() -> None:
    if _is_sqlite():
        return
    _retype("timestamp")
