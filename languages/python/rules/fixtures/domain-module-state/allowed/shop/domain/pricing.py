from collections.abc import Mapping

from shop.shared.cache import LIMITS


def quote(prices: Mapping[str, int], symbol: str) -> int:
    return min(prices[symbol] * 2, LIMITS["default"])
