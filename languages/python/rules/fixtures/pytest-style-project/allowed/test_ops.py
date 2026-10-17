import pytest


@pytest.fixture()
def base():
    return 1


@pytest.fixture()
def offset():
    return 2


@pytest.mark.slow()
@pytest.mark.parametrize("a,b,expected", [(1, 2, 3), (2, 3, 5)])
def test_add(base, offset, a, b, expected):
    assert a + b == expected
