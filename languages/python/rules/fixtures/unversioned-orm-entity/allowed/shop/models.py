from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(default=1)
    balance: Mapped[int]
    __mapper_args__ = {"version_id_col": version}


class AuditEntry(Base):
    __tablename__ = "audit_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str]


class Ledger(Base):
    __tablename__ = "ledgers"
    id: Mapped[int] = mapped_column(primary_key=True)
    total: Mapped[int]
