import pytest


@pytest.mark.skip(reason="needs the staging database")
def test_total():
    assert 1 + 1 == 2


def test_other():
    pytest.skip("needs the staging database")
