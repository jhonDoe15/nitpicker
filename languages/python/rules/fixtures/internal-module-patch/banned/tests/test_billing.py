from unittest import mock

from shop import billing


def test_bill():
    with mock.patch("shop.mailer.Mailer.send", return_value="sent"):
        assert billing.bill("a") == "sent"
