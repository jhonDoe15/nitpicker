from unittest.mock import Mock

from shop.checkout import Checkout


def test_pay():
    mailer = Mock()
    mailer.send.return_value = "a"
    assert Checkout(mailer).pay() == "ab"
