def total(prices: list[int]) -> int:
    return sum(prices)


def test_total() -> None:
    assert total([1, 2]) == 3
