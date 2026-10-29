import warnings

from .new_orders import Order


RENAMED = {"OldOrder": "Order"}


def __getattr__(name: str) -> object:
    return globals()[RENAMED[name]]


OldOrder = Order


def place() -> None:
    warnings.warn("use new place", DeprecationWarning, stacklevel=2)
