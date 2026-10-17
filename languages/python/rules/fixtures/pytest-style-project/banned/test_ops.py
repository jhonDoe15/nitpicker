import pytest


@pytest.fixture()
def base():
    return 1


@pytest.fixture()
def offset():
    return 2


@pytest.fixture
def third():
    return 3


def test_add(base, offset, third):
    assert base + offset == third
