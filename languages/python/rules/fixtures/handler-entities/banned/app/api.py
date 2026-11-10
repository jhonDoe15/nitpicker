from fastapi import APIRouter
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

router = APIRouter()


class Base(DeclarativeBase):
    pass


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)


@router.get("/orders/{order_id}")
def read_order(order_id: int) -> Order:
    return Order(id=order_id)
