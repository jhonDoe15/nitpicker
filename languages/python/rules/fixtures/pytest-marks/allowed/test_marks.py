import pytest


@pytest.mark.slow
def test_marked():
    assert 1


@pytest.mark.usefixtures("tmp_path")
def test_fixtures():
    assert 1


def test_argument(number):
    assert number
