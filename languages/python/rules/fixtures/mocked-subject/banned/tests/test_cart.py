from unittest.mock import patch

from shop.cart import total


@patch("shop.cart.discount", return_value=1)
def test_total(discount):
    assert total([1, 2]) == 2
