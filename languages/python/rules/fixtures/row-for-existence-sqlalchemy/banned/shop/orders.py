from sqlalchemy import func, select

from .models import Order


def has_open(session):
    return session.scalar(select(func.count()).select_from(Order).where(Order.id > 1)) > 0
