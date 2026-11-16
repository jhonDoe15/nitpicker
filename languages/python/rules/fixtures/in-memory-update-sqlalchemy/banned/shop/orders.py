from sqlalchemy import select

from .models import Order


def expire_pending(session):
    for order in session.scalars(select(Order).where(Order.status == "pending")):
        order.status = "expired"
    session.commit()
