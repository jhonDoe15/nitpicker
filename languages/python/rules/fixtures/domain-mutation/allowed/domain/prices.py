def with_tax(prices, rate):
    return [*prices, rate]


def ordered(prices):
    return sorted(prices)


def merged(table: dict[str, int], other: dict[str, int]) -> dict[str, int]:
    return {**table, **other}


def doubled(prices):
    result = []
    for price in prices:
        result.append(price * 2)
    result.sort()
    return result


def copied(prices):
    prices = list(prices)
    prices.append(0)
    return prices


def apply(self, repo, queue):
    repo.insert(1)
    queue.insert(0)
