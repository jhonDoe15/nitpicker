from shop import orders
from shop.model import Context, Order, Receipt


def handle(order: Order) -> Receipt:
    return orders.process(order)


def submit(ctx: Context):
    return orders.place(ctx)
