from unittest.mock import ANY, Mock


def test_found(rows):
    assert rows
    assert len(rows) > 0


def test_called():
    sender = Mock()
    sender.send()
    sender.send.assert_called_with(ANY)
