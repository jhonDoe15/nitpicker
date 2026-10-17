from dataclasses import dataclass


@dataclass(frozen=True)
class Order:
    total: int


def total(order: Order) -> int:
    return order.total
