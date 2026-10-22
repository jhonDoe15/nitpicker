def total(prices: list[int]) -> int:
    return sum(prices)


def test_totals() -> None:
    for prices, expected in [([1, 2], 3), ([4], 4)]:
        assert total(prices) == expected
