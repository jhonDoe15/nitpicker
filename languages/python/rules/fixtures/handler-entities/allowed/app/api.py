from dataclasses import dataclass

from fastapi import APIRouter
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

router = APIRouter()


class Base(DeclarativeBase):
    pass


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)


@dataclass(frozen=True)
class OrderView:
    id: int


@router.get("/orders/{order_id}")
def read_order(order_id: int) -> OrderView:
    order = Order(id=order_id)
    return OrderView(id=order.id)
