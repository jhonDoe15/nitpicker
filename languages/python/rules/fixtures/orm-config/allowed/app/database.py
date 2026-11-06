from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    return create_engine(url, echo=False, pool_pre_ping=True)
