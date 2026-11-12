import warnings

from .new_orders import Order

__version__ = "1"


def place(order: Order) -> None:
    warnings.warn("slow path", RuntimeWarning, stacklevel=2)
    print(order)
