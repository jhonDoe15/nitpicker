import pytest


@pytest.mark.skip
def test_total():
    assert 1 + 1 == 2


def test_other():
    pytest.skip()
