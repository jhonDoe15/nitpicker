import pytest


@pytest.mark.flaky(reruns=3)
def test_total():
    assert sum([2, 3]) == 5
