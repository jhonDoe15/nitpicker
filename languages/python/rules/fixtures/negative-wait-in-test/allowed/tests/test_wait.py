import threading


def test_not_notified():
    event = threading.Event()
    assert not event.is_set()
