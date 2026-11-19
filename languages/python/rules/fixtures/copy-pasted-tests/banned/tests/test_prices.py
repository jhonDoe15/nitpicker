from shop.prices import total


def test_small():
    assert total(10, "EUR") == 12


def test_medium():
    assert total(20, "EUR") == 24


def test_large():
    assert total(30, "EUR") == 36
