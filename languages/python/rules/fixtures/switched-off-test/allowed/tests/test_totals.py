import sys

import pytest


def total(prices: list[int]) -> int:
    return sum(prices)


@pytest.mark.skipif(sys.platform == "win32", reason="posix only")
def test_total() -> None:
    assert total([1, 2]) == 3


@pytest.mark.xfail(reason="bug 123", raises=ZeroDivisionError, strict=True)
def test_known_bug() -> None:
    assert total([1]) / 0


def test_gpu_total() -> None:
    if sys.platform == "win32":
        pytest.skip("no GPU on windows")
    assert total([1]) == 1
