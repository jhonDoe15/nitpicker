import itertools

from sqlalchemy import select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

CHUNK = 1000
PAGE = 20


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    active: Mapped[bool]


def recent(session: Session) -> list[User]:
    newest = select(User).where(User.active).order_by(User.id.desc())
    return list(session.scalars(newest.limit(PAGE)))


def by_ids(session: Session, ids: list[int]) -> list[User]:
    found: list[User] = []
    for part in itertools.batched(ids, CHUNK):
        found.extend(session.scalars(select(User).where(User.id.in_(part))))
    return found
