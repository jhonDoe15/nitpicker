from sqlalchemy import select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    active: Mapped[bool]


def recent(session: Session) -> list[User]:
    return list(session.scalars(select(User).where(User.active).limit(20)))


def by_ids(session: Session, ids: list[int]) -> list[User]:
    return list(session.scalars(select(User).where(User.id.in_(ids))))
