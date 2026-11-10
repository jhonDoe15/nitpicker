from typing import Callable, List, Optional, Union

import numpy as np

from app.core.cart import Cart
from app.core.repo import Repo


def annotated(
    first: list[int],
    second: dict[str, Cart],
    third: Optional[str],
    fourth: Callable[[int], str],
    fifth: np.ndarray,
    sixth: Union[int, str],
    seventh: List[Repo],
    eighth,
    ninth: int = 1,
    *rest: str,
    flag: bool = False,
    **options: int,
) -> Optional[Cart]:
    return None


def only_cart(cart: Cart) -> "Cart":
    return cart


def either(item: Cart | Repo) -> Union[Cart, Repo]:
    return item
