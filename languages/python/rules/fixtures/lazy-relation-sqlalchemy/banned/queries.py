from sqlalchemy import ForeignKey, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Customer(Base):
    __tablename__ = "customer"
    id: Mapped[int] = mapped_column(primary_key=True)


class Order(Base):
    __tablename__ = "order"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customer.id"))
    customer: Mapped[Customer] = relationship()


def customer_ids(session):
    return [order.customer.id for order in session.scalars(select(Order))]
