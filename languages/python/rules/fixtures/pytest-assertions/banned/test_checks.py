import pytest


def test_false():
    assert False


def test_fail():
    pytest.fail()


def test_except():
    try:
        int("x")
    except ValueError as error:
        assert str(error)


def test_composite():
    value = int("1")
    assert value and value > 0
