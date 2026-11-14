from sqlalchemy.orm.exc import StaleDataError

ATTEMPTS = 3


def mark_shipped(session, order):
    order.status = "shipped"
    for _ in range(ATTEMPTS):
        try:
            session.commit()
            return
        except StaleDataError:
            session.rollback()
