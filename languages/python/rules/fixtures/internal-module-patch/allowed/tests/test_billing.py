from unittest import mock

from shop import billing


class FakeMailer:
    def send(self, to: str) -> str:
        return "sent"


def test_bill():
    with mock.patch("time.sleep"):
        assert billing.bill("a", FakeMailer()) == "sent"
