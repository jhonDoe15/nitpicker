from sqlalchemy import update

from .models import Order


def expire_pending(session):
    session.execute(update(Order).where(Order.status == "pending").values(status="expired"))
    session.commit()
