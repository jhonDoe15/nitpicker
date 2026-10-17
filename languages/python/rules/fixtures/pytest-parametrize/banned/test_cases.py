import pytest


@pytest.mark.parametrize("a, b", [(1, 2)])
def test_names(a, b):
    assert a < b


@pytest.mark.parametrize(("a", "b"), ((1, 2), (3, 4)))
def test_values(a, b):
    assert a < b


@pytest.mark.parametrize("a", [1, 1])
def test_duplicate(a):
    assert a
