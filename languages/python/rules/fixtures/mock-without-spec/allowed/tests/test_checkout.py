from unittest.mock import create_autospec

from shop.checkout import Checkout
from shop.mailer import Mailer


def test_pay():
    mailer = create_autospec(Mailer, instance=True)
    mailer.send.return_value = "a"
    assert Checkout(mailer).pay() == "ab"
