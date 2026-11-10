from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from shop.models import Order


def load_orders(session: Session) -> list[Order]:
    query = select(Order).options(joinedload(Order.lines), joinedload(Order.payments))
    return list(session.scalars(query).unique())
