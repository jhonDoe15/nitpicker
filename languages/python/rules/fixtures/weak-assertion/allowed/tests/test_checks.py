from unittest.mock import Mock


def test_found(rows, order):
    assert rows == ["a", "b"]
    assert len(rows) == 2
    assert order.paid is True


def test_guard(order):
    assert order.customer is not None
    assert order.customer.name == "Ada"


def test_called():
    sender = Mock()
    sender.send(7)
    sender.send.assert_called_once_with(7)
