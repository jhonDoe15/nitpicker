def with_tax(prices, rate):
    prices.append(rate)
    return prices


def _sorted(prices):
    prices.sort()
    return prices


def merged(table: dict[str, int], other: dict[str, int]) -> dict[str, int]:
    table.update(other)
    return table
