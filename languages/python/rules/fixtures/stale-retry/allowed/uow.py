from sqlalchemy.orm.exc import StaleDataError
from tenacity import retry, retry_if_exception_type

from shop.db import SessionLocal
from shop.orders import apply_change, find_order


def change_quantity(uow, order_id, quantity):
    for _ in range(3):
        try:
            with uow:
                order = uow.orders.load(order_id)
                order.quantity = quantity
                uow.commit()
            return
        except StaleDataError:
            uow.rollback()


def fresh_session(order_id, quantity):
    for _ in range(3):
        try:
            session = SessionLocal()
            order = find_order(session, order_id)
            order.quantity = quantity
            session.commit()
            return
        except StaleDataError:
            session.rollback()


def through_helper(session, order_id, quantity):
    for _ in range(3):
        try:
            apply_change(session, order_id, quantity)
            session.commit()
            return
        except StaleDataError:
            session.rollback()


@retry(retry=retry_if_exception_type(StaleDataError))
def decorated(order_id, quantity):
    order = find_order(order_id)
    order.quantity = quantity
    order.session.commit()
