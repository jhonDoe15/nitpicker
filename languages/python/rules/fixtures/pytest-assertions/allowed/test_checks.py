import pytest


def test_fail():
    pytest.fail("the reason")


def test_except():
    with pytest.raises(ValueError, match="invalid") as caught:
        int("x")
    assert "invalid" in str(caught.value)


def test_separate():
    value = int("1")
    assert value
    assert value > 0
