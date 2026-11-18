from sqlalchemy import select

from .models import Order


def statuses(session):
    return [order.status for order in session.scalars(select(Order).where(Order.id > 1))]
