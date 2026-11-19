import pytest

from shop.prices import net, total


@pytest.mark.parametrize("price, expected", [(10, 12), (20, 24), (30, 36)])
def test_total(price, expected):
    assert total(price, "EUR") == expected


def test_net_small():
    assert net(10, "EUR") == 10


def test_total_medium():
    assert total(20, "EUR") == 24


def test_net_large():
    assert net(30, "EUR") == 30
