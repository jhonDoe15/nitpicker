import warnings

from .new_orders import Order


def __getattr__(name: str) -> object:
    raise AttributeError(name)


OldOrder = Order


def place() -> None:
    warnings.warn("use new place", DeprecationWarning, stacklevel=2)
