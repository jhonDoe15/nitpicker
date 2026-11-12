from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from shop.models import Order


def load_orders(session: Session) -> list[Order]:
    query = select(Order).options(selectinload(Order.lines), selectinload(Order.payments))
    return list(session.scalars(query))
