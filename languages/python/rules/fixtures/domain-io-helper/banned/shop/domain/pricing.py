from shop.shared.prices import fetch


def quote(symbol: str) -> float:
    return fetch(symbol) * 2
