from sqlalchemy.orm.exc import StaleDataError

from shop.models import Order

ATTEMPTS = 3


def mark_shipped(session, order_id):
    for _ in range(ATTEMPTS):
        try:
            order = session.get(Order, order_id)
            order.status = "shipped"
            session.commit()
            return
        except StaleDataError:
            session.rollback()
