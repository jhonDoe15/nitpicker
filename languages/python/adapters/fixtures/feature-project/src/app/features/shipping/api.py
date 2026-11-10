from typing import TYPE_CHECKING

from ..billing import rate

if TYPE_CHECKING:
    from app.features.orders.cart import Cart


def ship() -> str:
    return str(rate())


def cost(cart: "Cart") -> int:
    return cart.total
