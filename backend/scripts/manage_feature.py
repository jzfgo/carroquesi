#!/usr/bin/env python3
"""
Direct-DB feature flag management (no running server required).

Usage:
    uv run python scripts/manage_feature.py <firebase_uid> <feature> <on|off|reset>

Actions:
    on    -- upsert UserFeature with enabled=True
    off   -- upsert UserFeature with enabled=False
    reset -- delete the row (user reverts to registry default)
"""
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select

from app.db.models import User, UserFeature
from app.db.session import engine
from app.services.feature_flags import REGISTRY


def _now():
    return datetime.now(UTC).replace(tzinfo=None)


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)

    firebase_uid, feature, action = sys.argv[1], sys.argv[2], sys.argv[3]

    if feature not in REGISTRY:
        print(f"Unknown feature {feature!r}. Known flags: {', '.join(REGISTRY)}")
        sys.exit(1)

    if action not in ("on", "off", "reset"):
        print(f"Unknown action {action!r}. Must be one of: on, off, reset")
        sys.exit(1)

    with Session(engine) as session:
        user = session.exec(select(User).where(User.firebase_uid == firebase_uid)).first()
        if user is None:
            print(f"No user with firebase_uid={firebase_uid!r}")
            sys.exit(1)

        row = session.exec(
            select(UserFeature).where(
                UserFeature.user_id == user.id,
                UserFeature.feature == feature,
            )
        ).first()

        if action == "reset":
            if row:
                session.delete(row)
                session.commit()
                print(
                    f"Deleted UserFeature row -- {user.email} / {feature} now at registry default"
                )
            else:
                print(f"No row to delete -- {user.email} / {feature} already at registry default")
        else:
            enabled = action == "on"
            if row is None:
                row = UserFeature(
                    user_id=user.id,
                    feature=feature,
                    enabled=enabled,
                    granted_by="admin",
                )
                session.add(row)
            else:
                row.enabled = enabled
                row.updated_at = _now()
                session.add(row)
            session.commit()
            state = "enabled" if enabled else "disabled"
            print(f"{user.email} / {feature} -> {state}")


if __name__ == "__main__":
    main()
