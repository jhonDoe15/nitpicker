from shop.cart import total


def test_total():
    assert total([1, 2], lambda items: 1) == 2
