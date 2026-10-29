from collections.abc import Callable


def quote(price_of: Callable[[str], float], symbol: str) -> float:
    return price_of(symbol) * 2
