from dataclasses import dataclass

from sqlmodel import Session, select

from app.db.models import UserFeature


@dataclass(frozen=True)
class FlagDef:
    name: str
    default: bool
    description: str = ""


REGISTRY: dict[str, FlagDef] = {
    f.name: f
    for f in [
        FlagDef("ai_receipt_scanning", default=False, description="Gemini receipt scanning"),
    ]
}


def is_enabled(user_id: str, feature: str, session: Session) -> bool:
    row = session.exec(
        select(UserFeature).where(
            UserFeature.user_id == user_id,
            UserFeature.feature == feature,
        )
    ).first()
    if row is not None:
        return row.enabled
    return REGISTRY.get(feature, FlagDef(feature, default=False)).default


def get_enabled_flags(user_id: str, session: Session) -> list[str]:
    return [name for name in REGISTRY if is_enabled(user_id, name, session)]
