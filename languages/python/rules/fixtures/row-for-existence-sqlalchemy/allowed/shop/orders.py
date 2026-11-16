from sqlalchemy import exists, select

from .models import Order


def has_open(session):
    return session.scalar(select(exists().where(Order.id > 1)))
