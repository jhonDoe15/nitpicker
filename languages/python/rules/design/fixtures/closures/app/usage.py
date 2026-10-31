from app.model import Order, Session, Status


def settle(order: Order, session: Session) -> int:
    def check() -> int:
        if order.status == Status.OPEN:
            return 1
        elif order.status == Status.PAID:
            return 2
        return 0

    add = lambda value: order.lines().append(value)
    session.begin()
    try:
        add(order.total)
        return check()
    finally:
        session.close()


def deferred(session: Session) -> None:
    session.begin()
    try:
        pass
    finally:
        cleanup = lambda: session.close()
        cleanup()


def shadowing(session: Session) -> None:
    session.begin()
    handlers = [lambda session: session.close()]
    handlers[0](None)
