from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine
from sqlmodel import Session, create_engine

from app.core.config import get_settings


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().database_url)


def get_session() -> Generator[Session]:
    with Session(get_engine()) as session:
        yield session
