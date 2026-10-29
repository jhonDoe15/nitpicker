from shop.shared.cache import PRICES


def quote(symbol: str) -> int:
    return PRICES[symbol] * 2
