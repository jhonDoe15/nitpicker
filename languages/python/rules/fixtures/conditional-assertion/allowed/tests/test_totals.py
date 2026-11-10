import sys

import pytest


def total(prices: list[int]) -> int:
    return sum(prices)


def assert_totals(cases: list[tuple[list[int], int]]) -> None:
    for prices, expected in cases:
        assert total(prices) == expected


@pytest.mark.parametrize(("prices", "expected"), [([1, 2], 3), ([4], 4)])
def test_total(prices: list[int], expected: int) -> None:
    assert total(prices) == expected


def test_sum_of_built_data() -> None:
    prices = []
    for step in range(3):
        prices.append(step)
    assert total(prices) == 3


def test_missing_prices_are_rejected() -> None:
    with pytest.raises(TypeError, match="not iterable"):
        total(None)


@pytest.mark.skipif(sys.platform == "win32", reason="posix only")
def test_posix_total() -> None:
    assert total([1]) == 1


def test_optional_dependency() -> None:
    pytest.importorskip("numpy")
    assert total([1]) == 1
