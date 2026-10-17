import pytest


@pytest.mark.slow()
def test_marked():
    assert 1


@pytest.mark.usefixtures()
def test_fixtures():
    assert 1


def test_default(number=1):
    assert number


@pytest.mark.fast
def test_fast():
    assert 1


@pytest.mark.smoke
def test_smoke():
    assert 1
