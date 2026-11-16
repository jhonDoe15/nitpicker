from sqlalchemy import select

from .models import Order


def statuses(session):
    return list(session.scalars(select(Order.status).where(Order.id > 1)))
