import punq

from mailer import Mailer
from orders import Orders


def build_orders() -> Orders:
    container = punq.Container()
    container.register(Mailer)
    return Orders(container.resolve(Mailer))
