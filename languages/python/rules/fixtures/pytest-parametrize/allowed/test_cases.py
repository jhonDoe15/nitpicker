import pytest


@pytest.mark.parametrize(("a", "b"), [(1, 2), (3, 4)])
def test_pairs(a, b):
    assert a < b


@pytest.mark.parametrize("a", [1, 2])
def test_single(a):
    assert a
