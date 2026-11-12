from unittest.mock import patch

from shop.checkout import Checkout
from shop.mailer import Mailer


@patch("shop.checkout.send", autospec=True, return_value="b")
def test_pay(send):
    assert Checkout(Mailer()).pay() == "ab"
